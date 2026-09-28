# Releasing Alpine Shell

Alpine Shell ships an NSIS installer and updates clients using electron-updater with a
generic provider backed by Railway/MinIO (any S3-compatible store). This document covers the
one-time setup, the environment variables required to publish, and the per-release steps.

## One-Time Storage Setup (Railway/MinIO)

1. Provision the S3-compatible store (Railway/MinIO) and the `alpine-shell` bucket. See
   `docs/STORAGE.md` for the exact provisioning steps and env mapping.
2. Set `build.publish.url` in `package.json` to the store's public app-update URL. Keep the
   trailing slash. For example:

   ```json
   "publish": {
     "provider": "generic",
     "url": "https://bucket-production-4979d.up.railway.app/alpine-shell/",
     "channel": "latest"
   }
   ```

   electron-updater fetches `latest.yml` and the installer from this base URL, so it must point
   at the public root of the store where those artifacts are uploaded.

## Required Environment Variables

The publish script (`scripts/publish.js`) uploads the build artifacts to the store using the
S3-compatible API. Set these before running a release:

- `STORAGE_ENDPOINT`: the S3-compatible endpoint of the store.
- `STORAGE_ACCESS_KEY_ID`: access key ID for the store.
- `STORAGE_SECRET_ACCESS_KEY`: secret access key for the store.
- `STORAGE_BUCKET`: the bucket name (`alpine-shell`).
- `STORAGE_FORCE_PATH_STYLE`: set to `true` for MinIO-style path addressing.

See `docs/STORAGE.md` for how to obtain these.

## Release Steps

1. Bump `version` in `package.json` to the new release version.
2. Run the release:

   ```sh
   bun run release
   ```

   This:
   - builds the renderer with Vite,
   - builds the NSIS installer with electron-builder (which also generates `latest.yml`),
   - runs `scripts/publish.js`, which uploads the installer and `latest.yml` to the store.
3. Once the new `latest.yml` and installer are in the bucket, existing installs detect the new
   version on their next update check (about every six hours) and show an "Update available"
   notice. Nothing is downloaded or installed until the user does it in Settings > Updates.

You can re-run only the upload step with `bun run publish` if the build artifacts already exist.

Old installers are pruned automatically: after each upload, `scripts/publish.js` keeps only the five
most recent versions in the bucket (plus `latest.yml`) and deletes older `.exe` / `.exe.blockmap`
objects, so storage stays bounded.

## Automated Releases (GitHub Actions)

`.github/workflows/release.yml` runs the whole pipeline on a Windows runner whenever you publish a
GitHub Release:

1. In GitHub, create a new Release with a tag like `v0.2.0`. The tag is the version — the workflow
   sets the `package.json` version from it (a leading `v` is stripped).
2. The workflow installs dependencies, runs `bun run release` (Vite build + NSIS installer +
   `latest.yml` + upload to the store with pruning), and attaches the installer to the GitHub Release.
3. Installed clients find the update on their next check and offer it; the user installs it from
   Settings > Updates.

Add these repository secrets first (GitHub repo -> Settings -> Secrets and variables -> Actions):

- `STORAGE_ENDPOINT`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`
- `STORAGE_BUCKET`
- `STORAGE_FORCE_PATH_STYLE`

The job uses `windows-latest` because NSIS must build on Windows. Releasing on a published Release —
rather than on every push to `main` — keeps each version explicit and avoids pushing an update to
every user on every commit. Running `bun run release` locally remains a manual fallback.

## Installer Lifecycle (Portable -> NSIS)

This release switches the Windows target from `portable` to `nsis` and reconciles the app's
shell-replacement lifecycle with the NSIS installer:

- **Install location.** `installer.getInstalledExePath()` returns the actual running executable
  (`process.execPath`) for an installed (non-portable) build, so the shell-replacement
  (`HKCU\...\Winlogon\Shell`) and startup (`HKCU\...\Run\AlpineShell`) registry values always point
  at the real NSIS-installed exe regardless of where NSIS placed it.
- **First run.** A fresh NSIS install has no `.setup-complete` marker, so the existing first-run
  setup window still appears (shell / cursor / startup configuration). The portable-only
  self-install and `relaunchFromInstalled()` branches simply no-op under NSIS, which already
  performs file placement, shortcut creation, and uninstaller registration.
- **Uninstall safety (critical for a shell replacement).** The NSIS uninstaller runs the
  `customUnInstall` macro in `build/installer.nsh`, which launches
  `Alpine Shell.exe --uninstall-cleanup`. That calls `installer.revertSystemChanges()` to restore
  `HKCU\...\Winlogon\Shell` to `explorer.exe`, remove the startup entry, restore cursors, and clear
  the setup marker — and it runs BEFORE NSIS deletes the install directory, so a user who set Alpine
  as their shell is never locked out at next login. As a safety net the macro also reverts the two
  lockout-critical registry values directly in NSIS, so the shell is restored even if the app fails
  to launch.

The legacy portable `--uninstall` path and `registerUninstaller()` remain for backward
compatibility but are unused by NSIS installs.

## Previewing the Update Screen

`apps/desktop/electron/scripts/updaterScreen.cs` is the full-screen cover shown while Alpine updates
itself. It is compiled at runtime by the in-box C# 5 compiler and only appears during a real update —
`installer.startBrandedUpdate()` returns early when the app is not packaged, so it never shows in a
dev run. To look at it without performing an update, compile it by hand and pass `--preview`:

```powershell
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$scripts = "apps\desktop\electron\scripts"
& $csc /nologo /optimize /target:winexe /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll `
  /out:AlpineUpdater.exe "$scripts\updaterScreen.cs"
.\AlpineUpdater.exe --preview "" "" 0.9.9 "$scripts\alpineWordmark.png" "$scripts\averiaSerifLibre.ttf"
```

`--preview` skips the low-level keyboard guard, the taskbar suppression and the update worker
thread, and closes the cover on click or Escape. **Never run the compiled exe without it** — bare,
it kills `explorer.exe`, rewrites the shell registration and waits up to 60s for an installer that
is not coming.

The positional arguments are exactly the ones `startBrandedUpdate()` passes: installer path,
installed exe path, version, wordmark PNG, and the Averia Serif Libre TTF. The last two are
optional; the screen falls back to Segoe UI Variable Text and a text wordmark when either is
missing. The source hash names the cached exe under `%APPDATA%\Alpine Shell\updater\`, so editing
the source invalidates the cache on its own.

## Publishing a Plugin

Plugins are published to the marketplace object store with `scripts/publishPlugin.js`:

```sh
bun run publish:plugin presets/plugins/<plugin-id>
```

This packs the plugin folder into `<id>.alpineplugin` (a zip with `plugin.json` at the root,
built with the system `tar`/bsdtar and containment-checked against symlinks and path escapes),
computes its SHA-256, signs the digest with Ed25519, uploads the immutable bundle plus a per-plugin
`plugins/<id>/latest.json`, and rolls the plugin's card into the shared `plugins/index.json` catalog
(fetched, merged, re-uploaded `no-cache`). `apps/web` and the desktop marketplace both read that same
`index.json`.

### Required environment for plugin publishing

- Storage credentials: the `STORAGE_*` variables; see `docs/STORAGE.md`.
- `ALPINE_PLUGIN_SIGNING_KEY` — base64 of a PKCS8 PEM Ed25519 **private** key. If unset, the script
  warns and publishes **unsigned** (fine for first-party curated bundles during bring-up, but the
  desktop install path enforces the signature, so production bundles must be signed).

Generate the key pair once:

```sh
node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ed25519');console.log('PUB',publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'));console.log('PRIV_B64',Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'))"
```

Paste `PUB` into `MARKETPLACE_PUBLIC_KEY` in `electron/pluginMarketplaceContract.js` (the client
verifies against it), and store `PRIV_B64` as the `ALPINE_PLUGIN_SIGNING_KEY` GitHub secret / local
env. The public key baked into the app and the private key used to sign must always match, or every
install will fail signature verification.

## Storage: Railway/MinIO

Railway/MinIO is the store. The upload code (`scripts/publish.js` for installers,
`scripts/publishPlugin.js` for plugins) sources its S3 client from the shared `scripts/storage.js`
factory, which reads the `STORAGE_*` env vars. See `docs/STORAGE.md` for the exact provisioning
steps and env mapping.

## Code Signing Note

Auto-update on Windows works without code signing: clients will download and apply updates from the
configured store. However, until the installer is code-signed, Windows SmartScreen will show an
"unrecognized app" / publisher warning prompt when users run the installer. Code signing the NSIS
installer removes that prompt and improves the reputation of subsequent auto-updates.

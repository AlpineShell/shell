# Releasing Alpine Shell

Alpine Shell ships an NSIS installer and auto-updates clients using electron-updater with a
generic provider backed by Railway/MinIO (any S3-compatible store). This document covers the
one-time setup, the environment variables required to publish, and the per-release steps.

## One-Time Storage Setup (Railway/MinIO)

1. Provision the S3-compatible store (Railway/MinIO) and the `alpine-shell` bucket. See
   `docs/STORAGE.md` for the exact provisioning steps and env mapping.
2. Leave `build.publish.url` in `apps/desktop/package.json` pointing at the licence-gated feed of
   the auth service. Keep the trailing slash:

   ```json
   "publish": {
     "provider": "generic",
     "url": "https://auth.alpineshell.com/releases/",
     "channel": "latest"
   }
   ```

   electron-updater asks this URL for `latest.yml` and the installer with the licence token as a
   bearer header, and the auth service redirects a valid licence to a short-lived presigned URL on
   the bucket. Never point it at the bucket itself: the feed is what checks the licence.

## Required Environment Variables

The publish script (`scripts/publish.js`) uploads the build artifacts to the store using the
S3-compatible API. Set these before publishing:

- `STORAGE_ENDPOINT`: the S3-compatible endpoint of the store.
- `STORAGE_REGION`: optional, defaults to `us-east-1`.
- `STORAGE_ACCESS_KEY_ID`: access key ID for the store.
- `STORAGE_SECRET_ACCESS_KEY`: secret access key for the store.
- `STORAGE_BUCKET`: the bucket name (`alpine-shell`).
- `STORAGE_FORCE_PATH_STYLE`: set to `true` for MinIO-style path addressing.

See `docs/STORAGE.md` for how to obtain these.

## Channels

There are two update channels, and each has its own manifest in the bucket:

| Channel | Tag | Manifest | Who gets it |
| --- | --- | --- | --- |
| Stable | `vMAJOR.MINOR.PATCH`, a full GitHub Release, e.g. `v1.0.0` | `latest.yml` | Everyone. The website's download and a fresh install are always stable. |
| Preview | `vMAJOR.MINOR.PATCH-nightly.YYYYMMDD.N`, a pre-release, e.g. `v1.0.1-nightly.20261103.0` | `nightly.yml` | Whoever enables Preview builds from Settings search or the website guide. |

`electron/releaseVersions.js` holds the rules both the app and `publish.js` use. A nightly is numbered towards the patch after the latest stable release, so it sorts above that release and below the next one: someone who turns nightly builds off again stays on their build until a stable release passes it, and is never moved down. The app picks the channel at every check (`autoUpdater.channel` is `latest` or `nightly`), keeps downgrades off, and remembers the choice as `channel` in `<userData>/update-prefs.json`; without a choice a nightly build follows nightly and every other build follows stable.

The versions before 1.0.0 were numbered after their day, `0.YYYYMMDD.N`. The first numbered release is `1.0.0` because semver puts it above every one of them, so an install of any age updates to it without help. `releaseVersions.compareVersions` also ranks the date-numbered versions below every numbered version, pre-releases included, so the first nightlies sort above them, and a date-numbered build allows a downgrade. The release workflow still accepts a date-numbered tag on `latest.yml`.

The website's `/changelog` lists both channels from these GitHub Releases, and the "What's new" row on the Updates page opens it at the running version (or the one on offer). The release body is the note customers read: write the notes of a stable release by hand. Generated notes are cut down to the `feat`, `fix` and `perf` titles there.

## Release Steps

Cut a release by publishing a GitHub Release; the workflow under Automated Releases below does the
rest. A local build is the fallback for when CI is unavailable, and it needs everything the
workflow reads from its secrets, set in the environment or in `apps/desktop/.env`:

- `ALPINE_RELEASE_BUILD=1`, `ALPINE_LICENCE_PUBLIC_KEYS` and `ALPINE_MARKETPLACE_PUBKEY`, so
  `scripts/generateLicenceConfig.js` bakes a release config instead of a development one.
- The `STORAGE_*` variables above.
- A `version` in `apps/desktop/package.json` newer than the one the feed offers.

Then run `bun run typecheck` and `bun run test`, and finally:

```sh
bun run release
```

This bakes the licence config, builds the renderer with Vite, builds the NSIS installer with
electron-builder (which also generates `latest.yml`) and runs `scripts/publish.js`, which uploads
the installer and `latest.yml` to the store. `publish.js` refuses to upload anything unless the
licence config packed into `resources/app.asar` is a release build with at least one key, the
packaged `resources/app-update.yml` points at `build.publish.url`, and the version in
`release/latest.yml` is newer than the `latest.yml` already in the bucket. A bucket `latest.yml` that
names no version is refused too.

You can re-run only the upload step with `bun run publish` if the build artifacts already exist. When
the bucket's `latest.yml` is byte for byte the one in `release/`, that build is already live and
`publish.js` uploads it again, so an interrupted publish can be finished this way.

Old installers are pruned automatically: after each upload, `scripts/publish.js` keeps only the five
most recent versions in the bucket (plus `latest.yml`) and deletes older `.exe` / `.exe.blockmap`
objects, so storage stays bounded. By then the new version is live, so a failed prune is logged and
does not fail the publish.

## Automated Releases (GitHub Actions)

`.github/workflows/release.yml` runs on a `blacksmith-4vcpu-windows-2025` runner, because NSIS must
build on Windows, whenever a GitHub Release is published:

1. For a stable release, create a full Release with a `MAJOR.MINOR.PATCH` tag greater than the last
   stable one, such as `v1.0.0`. Nightlies need nothing: `.github/workflows/nightly.yml` runs every
   night at 02:00 UTC (or by hand from the Actions tab), skips the night when `main` has not moved
   since the last tag, and otherwise creates the next `-nightly.YYYYMMDD.N` pre-release with
   generated notes and starts this workflow on its tag with `gh workflow run`, because a release
   created with `GITHUB_TOKEN` does not trigger `release: published`. The workflow strips the leading
   `v`, writes the version into `apps/desktop/package.json` and picks the channel from the tag.
2. The `verify` job runs `ci.yml` on the tagged commit: the frozen install, typecheck, lint and
   tests every pull request gets. Only when it passes does the build job install dependencies with
   `bun install --frozen-lockfile`, build the SDK, bake and check the licence config, build the
   renderer and the installer, and check the update feed URL, the Electron fuses and, once signing
   is set up, every signature.
3. electron-builder writes the channel's manifest (`-c.publish.channel=latest` or `nightly`), and
   `scripts/publish.js` uploads the installer and that manifest to the store and prunes old versions,
   keeping five per channel. A pre-release with a plain `MAJOR.MINOR.PATCH` tag stops short of that:
   its installer is attached to the GitHub Release for testing and no feed is touched. To ship that
   build to everyone, publish a full release with a new tag.
4. A separate job, the only one with a write token, attaches the installer to the GitHub Release.
5. Installed clients see the new version on their next update check.

Repository secrets (Settings > Secrets and variables > Actions):

- `STORAGE_ENDPOINT`, `STORAGE_REGION` (optional), `STORAGE_ACCESS_KEY_ID`,
  `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET` and `STORAGE_FORCE_PATH_STYLE`: the store
  `publish.js` uploads to.
- `ALPINE_LICENCE_PUBLIC_KEYS`: the licence verification keys baked into the build. The job fails
  without at least one.
- `ALPINE_MARKETPLACE_PUBKEY`: the public half of `ALPINE_PLUGIN_SIGNING_KEY`, baked so the build
  can verify plugin signatures. The job fails without it, because a release build refuses every plugin it cannot verify.
- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`: optional, see Code Signing below.

Repository variables:

- `ALPINE_AUTH_BASE` and `ALPINE_WEBSITE_BASE`: optional overrides of the auth service and website
  the build talks to. Unset, they default to `https://auth.alpineshell.com` and
  `https://alpineshell.com`.

Releasing on a published Release rather than on every push to `main` keeps each version explicit.
Because `publish.js` refuses a version the feed already offers, re-run only the failed job when the
attach step fails, not the whole workflow.

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
(fetched, merged, re-uploaded `no-cache`). The
[website](https://github.com/AlpineShell/website) and the desktop marketplace both read that same
`index.json`.

### Required environment for plugin publishing

- Storage credentials: the `STORAGE_*` variables; see `docs/STORAGE.md`.
- `ALPINE_PLUGIN_SIGNING_KEY`: base64 of a PKCS8 PEM Ed25519 **private** key. The script refuses to
  publish without it, because a release build refuses to install a bundle whose signature does not
  verify.

Generate the key pair once:

```sh
node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ed25519');console.log('ALPINE_MARKETPLACE_PUBKEY='+Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64'));console.log('ALPINE_PLUGIN_SIGNING_KEY='+Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'))"
```

Store `ALPINE_MARKETPLACE_PUBKEY` as a secret of this repository: the release workflow bakes it into
`electron/marketplacePublicKey.generated.js` through `scripts/generateLicenceConfig.js`, and a release
build refuses to install any bundle whose signature does not verify against it. Keep
`ALPINE_PLUGIN_SIGNING_KEY` wherever plugins are published, and apart from the `STORAGE_*`
credentials where you can. The public key baked into the app and the private key used to sign must
always match, or every install from the store fails with "its signature could not be verified".

The order matters when the key is new: re-publish every plugin in the catalog signed, check that each
`plugins/<id>/latest.json` carries a `signature`, and only then release a build with the key baked.

## Storage: Railway/MinIO

Railway/MinIO is the store. The upload code (`scripts/publish.js` for installers,
`scripts/publishPlugin.js` for plugins) sources its S3 client from the shared `scripts/storage.js`
factory, which reads the `STORAGE_*` env vars. See `docs/STORAGE.md` for the exact provisioning
steps and env mapping.

## Code Signing

Auto-update on Windows works without code signing, but until the build is signed Windows
SmartScreen shows an "unrecognized app" prompt on the installer, and Smart App Control or an App
Control policy can refuse to load it at all. Those policies check every DLL and native module as
well, so a signed `Alpine Shell.exe` would still fail to start the moment it loaded an unsigned
`ffmpeg.dll` or `koffi.node`. Every PE file the installer ships therefore has to be signed, not
just the installer.

Nothing is signed until the `WIN_CSC_LINK` secret exists. From then on the release job hands it and
`WIN_CSC_KEY_PASSWORD` to electron-builder, and to no other step. electron-builder signs every
`.exe`, `.dll` and `.node` file it packs (`build.win.signExts` adds the last two) and the installer,
and `forceCodeSigning` makes the build fail instead of shipping unsigned. The "Verify code
signatures" step then runs `Get-AuthenticodeSignature` over every `.exe`, `.dll` and `.node` in
`release/win-unpacked` and the installer, and stops the release before publishing if any of them is
not `Valid`. Without the secret the build warns and ships unsigned, as it does today.

`WIN_CSC_LINK` takes what electron-builder accepts for a certificate: a base64-encoded `.pfx`, or a
link to one. A certificate whose key lives on a hardware token or in a cloud HSM, which is how
public CAs issue code signing certificates now, needs `win.azureSignOptions` or a
`win.signtoolOptions.sign` hook in the build step instead, and `SIGN_WINDOWS_BINARIES` in
`release.yml` then has to key off that service's secret rather than `WIN_CSC_LINK`; `signExts` and
the signature check stay as they are.

Two executables stay unsigned whatever this config says: the update cover `AlpineUpdater-*.exe` and
`msix-launcher.exe` are compiled on the user's PC at run time from the `.cs` sources in
`electron/scripts`. Test the first signed build on a PC with Smart App Control on before claiming
support for it.

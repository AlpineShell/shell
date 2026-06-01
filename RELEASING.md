# Releasing Alpine Shell

Alpine Shell ships an NSIS installer and auto-updates clients using electron-updater with a
generic provider backed by a Cloudflare R2 bucket. This document covers the one-time setup,
the environment variables required to publish, and the per-release steps.

## One-Time Cloudflare R2 Setup

1. In the Cloudflare dashboard, create an R2 bucket (for example `alpine-shell-updates`).
2. Enable public access for the bucket. You can either:
   - Use the bucket's managed `r2.dev` public URL, or
   - Attach a custom domain to the bucket for a cleaner update URL.
3. Copy the resulting public base URL and replace `REPLACE_WITH_R2_PUBLIC_URL` in
   `package.json` under `build.publish.url`. Keep the trailing slash. For example:

   ```json
   "publish": {
     "provider": "generic",
     "url": "https://pub-xxxxxxxx.r2.dev/",
     "channel": "latest"
   }
   ```

   electron-updater fetches `latest.yml` and the installer from this base URL, so it must point
   at the public root of the bucket where those artifacts are uploaded.

## Required Environment Variables

The publish script (`scripts/publish.js`) uploads the build artifacts to R2 using the S3-compatible
API. Set these before running a release:

- `R2_ACCOUNT_ID` — your Cloudflare account ID (used to build the R2 S3 endpoint).
- `R2_ACCESS_KEY_ID` — R2 API token access key ID.
- `R2_SECRET_ACCESS_KEY` — R2 API token secret access key.
- `R2_BUCKET` — the bucket name (for example `alpine-shell-updates`).

Create the access key pair from the R2 dashboard under "Manage R2 API Tokens". The token needs
object read/write permission on the bucket.

## Release Steps

1. Bump `version` in `package.json` to the new release version.
2. Run the release:

   ```sh
   bun run release
   ```

   This:
   - builds the renderer with Vite,
   - builds the NSIS installer with electron-builder (which also generates `latest.yml`),
   - runs `scripts/publish.js`, which uploads the installer and `latest.yml` to R2.
3. Once the new `latest.yml` and installer are in the bucket, existing installs detect the new
   version on their next update check and auto-update.

You can re-run only the upload step with `bun run publish` if the build artifacts already exist.

Old installers are pruned automatically: after each upload, `scripts/publish.js` keeps only the two
most recent versions in the bucket (plus `latest.yml`) and deletes older `.exe` / `.exe.blockmap`
objects, so storage stays well within the R2 free tier.

## Automated Releases (GitHub Actions)

`.github/workflows/release.yml` runs the whole pipeline on a Windows runner whenever you publish a
GitHub Release:

1. In GitHub, create a new Release with a tag like `v0.2.0`. The tag is the version — the workflow
   sets the `package.json` version from it (a leading `v` is stripped).
2. The workflow installs dependencies, runs `bun run release` (Vite build + NSIS installer +
   `latest.yml` + upload to R2 with pruning), and attaches the installer to the GitHub Release.
3. Installed clients auto-update from R2 on their next check.

Add these repository secrets first (GitHub repo -> Settings -> Secrets and variables -> Actions):

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

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

## Code Signing Note

Auto-update on Windows works without code signing: clients will download and apply updates from R2
as configured. However, until the installer is code-signed, Windows SmartScreen will show an
"unrecognized app" / publisher warning prompt when users run the installer. Code signing the NSIS
installer removes that prompt and improves the reputation of subsequent auto-updates.

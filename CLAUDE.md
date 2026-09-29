# CLAUDE.md

This file provides context for AI assistants working on the alpine-shell codebase.

## Project Overview

Alpine Shell is a Windows desktop shell replacement built with Electron, React, TypeScript, and Tailwind CSS. It provides a topbar with system controls (volume, brightness, Wi-Fi, Bluetooth) and a desktop wallpaper layer. Windows only — uses Win32 APIs via koffi (FFI) and PowerShell for system integration.

## Repository Layout

This is a Bun-workspaces monorepo. Run all commands from the repo root.

- `apps/desktop/` — the Electron desktop shell (the original app; package name `alpine-shell`). Its build/release config (electron-builder, Railway/MinIO publish) lives in `apps/desktop/package.json`.
- `packages/plugin-sdk/` — `@alpine/plugin-sdk`, the contract plugins build against. Licensing has no shared package: the desktop verifies server-signed licence tokens in `apps/desktop/electron/licenceToken.js` against the keys baked into `electron/licenceConfig.generated.js`, and the account service ([AlpineShell/auth](https://github.com/AlpineShell/auth)) owns purchases, licences and activations.
- `apps/desktop/vendor/` — the vendored release tarball of `@alpine/ui` ([AlpineShell/ui](https://github.com/AlpineShell/ui)), the shared React primitives (Button, Row, Toggle, …) and design tokens that settings and setup render with. Import primitives by name from `@alpine/ui`. A missing prop or look goes into the library and ships as a release, never into a local copy; `bun run propagate` in the ui repo opens the bump PR here.

The website (marketing, docs, plugin marketplace pages) lives in its own repo: [AlpineShell/website](https://github.com/AlpineShell/website).

Unless noted otherwise, file paths in the sections below are relative to `apps/desktop/`.

## Architecture

### Two-Process Model (Electron)
- **Main process** (`electron/main.js`): Creates one desktop window and one topbar window per display. Manages display hotplug, appbar registration, and cursor tracking for the transparent topbar.
- **Renderer process** (`src/`): React app that renders in two modes based on URL param (`?mode=desktop` or `?mode=topbar`).

### Module System (Backend)
Each backend module in `electron/modules/` exports:
- `handlers`: Object mapping IPC channel names to handler functions (registered via `ipcMain.handle`)
- `start(broadcast)`: Function called once at startup to begin polling. `broadcast(channel, data)` sends to all renderer windows.

Modules are registered in `electron/main.js` via `ipc.register(...)`.

### Hook Pattern (Frontend)
React hooks in `src/hooks/` follow a consistent pattern:
- Use `useShellState` for read-only state (fetch initial value, subscribe to changes)
- Hooks with setters (useVolume, useMonitors) add optimistic local state updates

### IPC Bridge
`electron/preload.js` exposes `window.shell` and `window.topbar` APIs via Electron's context bridge. Types are defined globally in `src/types/shell.d.ts`. `window.setup` and `window.licence` exist only on pages whose mode is `setup` or `settings`, so plugin widgets and plugin windows never see them, and the `setup/*` and `licence/*` handlers are wrapped by `electron/trustedSenders.js`, which refuses any invocation whose sender is not the setup or settings window that `main.js` registered.

Every invoke handler is also checked against the page that sent it: `ipc.register(...)` and `ipc.handle(channel, handler)` wrap each handler with `trustedSenders.guardShellSender`, which refuses a call unless the sender frame shows the shell's own page (the packaged `dist/index.html`, or the Vite dev server in development) or, for the `plugin-window/*` channels only, an `alpine-plugin://<id>/` page of the plugin the call names. The URL rules live in `electron/pageUrls.js`. Register new handlers through `ipc.register` or `ipc.handle`, never with `ipcMain.handle` directly. The same rules keep every window on its own pages: `electron/shellPageGuard.js`, which `main.js` attaches to every web contents, denies `window.open` (an https link opens in the browser instead) and blocks a navigation or redirect that leaves the shell page, or in a plugin window that plugin's own `alpine-plugin://<id>/` pages, and `main.js` grants no web permission other than `clipboard-sanitized-write`. A release build has no application menu and no DevTools, and the built page carries a Content-Security-Policy (`vite.config.ts`) that allows no inline, evaluated or remote script: never add an inline `<script>`, `eval` or `new Function`.

### Licence Module
`electron/modules/licence.js` owns the desktop side of licensing: it reads `<userData>/licence.json`, verifies the Ed25519 licence token offline against the public keys baked into `electron/licenceConfig.generated.js` (written by `scripts/generateLicenceConfig.js`; a release build reads only that file and ignores every environment variable), computes the state (`development`, `valid`, `unlicensed`) with the pure state machine in `electron/licenceState.js` and runs the device-flow sign-in against the auth service. A licence is activated once, online, at install, and the token carries no expiry: after activation the desktop never calls the account service for licensing again, so a PC that is offline forever keeps working forever. Nothing about the PC is collected after activation; at activation the installer sends the hashed device id, the app version, the Windows computer name as the display name the account page shows and a binding proof: a tier label (`tpm`, `dpapi` or `machine`) and one opaque base64url sha256 hash, which the server puts in the token as the `bind` claim. The proof is built by the pure ladder in `electron/licenceBinding.js` (tested on Linux CI with fake providers) over the providers wired in `electron/licenceBindingProviders.js`: first a non-exportable ECDSA P-256 key persisted in the Microsoft Platform Crypto Provider through CNG (`electron/platformCrypto.js`, koffi over `ncrypt.dll`; the hash is over the exported public blob and every check signs a fresh challenge that Node verifies), else a 32-byte secret sealed with `safeStorage` in `<userData>/licence-binding.json` (`electron/bindingSecretStore.js`; the hash is over the plaintext, which never leaves the machine and cannot be unsealed elsewhere), else sha256 over MachineGuid, the system volume serial and the SMBIOS UUID together (`electron/machineFingerprint.js`). The TPM public key, the sealed secret, the volume serial and the SMBIOS UUID are never sent: only the tier and the hash leave the machine. The binding hash is the anti-copy proof; the device id (sha256 of MachineGuid) is the convenience that lets the same PC re-activate after a reinstall without consuming a seat, and both stay. At every start the desktop reproduces the proof and compares it with the claim in constant time; a mismatch (a cleared TPM, a new motherboard, a rebuilt Windows profile, a Windows reinstall, or a copied `licence.json`) is `unlicensed` with the reason `binding-mismatch`, never a lapse, and the sign-in window says in plain words how to put the PC back. A token with no `bind` claim keeps working unchanged, and the next activation on that PC upgrades it. `unlicensed` (file missing, unreadable, unverifiable, minted for another PC, or bound to a proof this PC cannot reproduce) never takes the desktop away: `main.js` starts the shell anyway and opens the sign-in window (`electron/licenceStartup.js`). There is no grace, no lapse and no hand-back to Explorer for a licence, and nothing may add one. The trust root is the baked key list only: never add a key cache under userData or an environment override that a release build honours. The same rule covers the marketplace signing key in `electron/pluginSignature.js`: a release build reads `electron/marketplacePublicKey.generated.js` (written by the same generator from `ALPINE_MARKETPLACE_PUBKEY`) and ignores the environment. The updater is the one remaining call that carries the licence token: it sends `licence.currentToken()` as a bearer header to the licence-gated feed at `build.publish.url` about every six hours, skips checks without a token, and when the feed refuses the licence (refunded, released or revoked) it reports on the Updates page that updates are not available for this licence and touches nothing else. `electron/modules/updater.js` still honours `checkForUpdates: false` in `<userData>/update-prefs.json` (the updater then makes no request at all, scheduled, by hand or after a sign-in), but settings no longer shows a switch for it. Every handler that changes the machine (registering the shell, the Run entry, test-out) must call `licence.requireValid()` in the main process before acting; the renderer is never the gate.

## Commands

Run from the repo root; Bun resolves the right workspace via `--filter`.

- `bun start` (or `bun start app`) — Start the full desktop app (Vite dev server + Electron). Replaces `explorer.exe` with Alpine Shell while running.
- `bun run build` — Build the Windows installer (Vite build + electron-builder).
- `bun run release` — Build the installer and publish it to Railway/MinIO.

Desktop-only iteration: `bun --filter alpine-shell dev` (Vite server only), `bun --filter alpine-shell electron` (Electron only; requires Vite already running).

## Code Conventions

- **No descriptive text in the UI by default.** A page title, a section heading or a control that is clear on its own gets no subtitle, description or helper paragraph under it. Add one only when someone would otherwise not know what a thing does or what is about to happen, and then keep it to one short sentence. Explaining how something works belongs in the docs, not on the screen where it sits: walls of grey text make the interface look worse, not clearer.
- **No code comments. None.** Name functions, variables, and types descriptively instead. This covers every kind: file headers, block comments explaining a design decision, `//` notes above a tricky line, and comments in tests. If a decision needs explaining, it belongs in the commit message or the pull request, where it is read once by a reviewer — not in the file, where it is read forever and rots. If a line needs explaining, rename something until it does not.
- **Single responsibility.** Each function does one thing.
- **DRY.** Use `useShellState` for read-only hooks. Use `runPowerShell` from `electron/powershell.js` for one-shot PowerShell commands.
- **No default exports** except for React components (React convention).
- **Type definitions** go in `src/types/shell.d.ts`, not inline in components or hooks.
- **File naming**: camelCase for all source files. Hook files are named after their exported function (e.g., `useMonitors.ts` exports `useMonitors`).
- **Never assert a Windows path literal in a test.** The shell is Windows-only but CI runs on Linux, where `C:\...` is a *relative* path — so `path.resolve` prepends the runner's working directory and the assertion fails only in CI, after passing locally. For an absolute fixture directory write `path.resolve(path.join(path.sep, 'plugins', 'com.example'))`, which is absolute on both platforms, and build expected values from that same constant. A `C:` literal is only safe for a value the code under test passes through without resolving.
- **Require `electron` inside the function that uses it**, never at module scope, in any `electron/` module that has a test. CI builds with `ELECTRON_SKIP_BINARY_DOWNLOAD`, so a module-scope `require('electron')` throws there and the test file fails to import before a single case runs. `shellNotice.js` and `pluginWindows.js` both learned this the same way.

## Key Technical Details

- **Topbar transparency**: The topbar window is transparent and uses main-process cursor tracking (not `{ forward: true }`) to toggle `setIgnoreMouseEvents`. This avoids click-through issues on Windows layered windows.
- **Volume control**: Uses a persistent PowerShell process (`volume.js`) that compiles a C# COM interop class once, then sends instant commands. This avoids 200ms+ startup per PowerShell invocation.
- **Brightness**: External monitors use DDC/CI via dxva2.dll (koffi FFI). Internal displays use WMI. Both are probed at startup.
- **AppBar**: Reserves screen work area via `SystemParametersInfoW(SPI_SETWORKAREA)` so maximized windows don't overlap the topbar.

## Adding a New System Module

1. Create `electron/modules/yourModule.js` with `handlers` and `start(broadcast)` exports
2. Register it in `electron/main.js`: add to the `ipc.register(...)` call
3. Add IPC channels to `electron/preload.js` under the appropriate namespace
4. Add types to `src/types/shell.d.ts`
5. Create a hook in `src/hooks/` using `useShellState` for read-only data
6. Use the hook in your component

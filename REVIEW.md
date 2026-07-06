# Review instructions

Alpine Shell is a Windows-only Electron desktop shell (main + renderer, Win32 via koffi FFI, PowerShell for system integration, plus a license/release pipeline). Review for correctness that would break the running shell, corrupt a release/auto-update, or bypass a security boundary — not style. Paths are relative to `apps/desktop/` unless noted.

## What "Important" (🔴) means here

Reserve 🔴 for these repo-specific failure classes. Each finding needs a `file:line` citation in the changed code.

- **IPC contract drift** — a channel string must be identical across every layer it touches: the module `handlers` key (or `ipcMain.on`/`broadcast`), the `ipcRenderer.invoke/send/on/sendSync` in `preload.js` under the right namespace, and (for invoke/on only) the type in `src/types/shell.d.ts`. The strongest signal is a literal typo between layers (`volume-get` vs `volumeGet`); lead with that. **Hard precondition:** do not raise an IPC-drift finding unless you have opened and quoted the line in each layer the channel actually touches. "I could not find X in preload" is not evidence of drift — X may be an internal `win.webContents.send` target (e.g. `launcher/show`) or a module-to-module helper. The `shell.d.ts` type side is checked by `tsc` in CI; only flag it when a channel is added with no type at all.
- **License / activation bypass** — `packages/license/src/index.ts` exports only `isWellFormedKey`/`normalizeKey`; `ActivationResponse.signature` is typed (`:16`) but verified nowhere. If a PR adds code that reads `ActivationResponse.status`/`plan`/`expiresAt` and acts on it (gates a feature, unlocks UI) while trusting those fields without verifying `.signature`, flag it: an unverified response must not be treated as valid. Do NOT prescribe a specific algorithm, and do NOT flag the mere absence of activation code.
- **Command-execution surface (`modules/runCommand.js`)** — handlers `run/exec`, `run/exec-terminal` (`:219-221`) are renderer-facing. `expandEnv()` (`:11-16`) expands `%VAR%` in the user query and the result flows into `resolve()`/`splitCommand()`/`runShellExecute()`. Flag a PR that lets `expandEnv` output bypass `resolveExecutable` validation, or that interpolates a user-derived value into the `Start-Process` string (`:164-167`) without wrapping it in `quotePs()`.
- **PowerShell / netsh injection** — user-derived values (Wi-Fi SSID/password) interpolated into an `exec`/`spawn`/PowerShell string without escaping. `modules/network.js` interpolates `ssid` into `netsh wlan connect name="${ssid}"` and `ssid`/`password` into profile XML without entity-encoding. Any new interpolation of user input, or a change here that drops escaping, is Important.
- **FFI / Win32 handle safety (koffi)** — a physical-monitor handle from `GetPhysicalMonitorsFromHMONITOR` not freed via `DestroyPhysicalMonitors` in a `finally`; a NEW `koffi.register()` whose returned pointer the diff assigns to a function-local (not module-level) variable (GC → use-after-free while a hook is armed) or that is not `koffi.unregister`'d after `Unhook*`; a new `koffi.load('<dll>')` for a non-core DLL (dxva2, dwmapi, comctl32) not wrapped in try/catch with a null guard at each call site.
- **Window & process lifecycle** — across display hotplug, the cursor-tracker `setInterval` and the `ipcMain.on('topbar/set-active-region', …)` listener must both be torn down in the topbar's `'closed'` handler; `screen.on('display-*')` listeners registered in `startShellMode` must not accumulate if it is re-entered (e.g. setup test-out). Broken AppBar `SPI_SETWORKAREA` pairing (register without matching unregister, or `repositionShell` leaving the shell positioned but the work area reverted) that could leave the desktop unusable.
- **Startup/polling robustness** — a `start(broadcast)` that throws on missing hardware (no external monitor/dxva2, no battery, no Bluetooth radio) and takes module or app startup down with it; a handler that throws instead of catching and returning a sensible fallback (the established pattern).
- **Release / auto-update integrity** — changes to `scripts/publish.js` (`uploadExtensions` must keep `.exe`/`.exe.blockmap`/`.yml`; `installerKeyPattern`; `versionsToKeep>=1`; `compareVersionsDescending` numeric-only — `parseInt` on a non-numeric segment yields `NaN`→0, and pruning keeps only the most-recent `versionsToKeep`, so a mis-sort can drop a needed installer and orphan `latest.yml`), the `build.publish.url` in `package.json`, R2 secret wiring or the semver-tag gate in `.github/workflows/release.yml`, `updater.js` (`autoDownload`/`autoInstallOnAppQuit` must stay `false`; check interval not below 1h), the uninstall registry key in `installer.js`, or the `customUnInstall` macro in `build/installer.nsh` that **must** revert the Winlogon `Shell` value to `explorer.exe` before file deletion — a regression locks the user out at next login.

If a diff touches none of these classes, default to "No blocking issues." and surface at most convention nits.

## Cap the nits

Report at most 6 Nits per review (test suggestions count against this cap). If there are more, give the count in the summary instead of posting each inline. If everything found is a Nit, open the summary with "No blocking issues."

## Convention checks (Nit level)

Flag newly introduced violations of CLAUDE.md conventions:

- Code comments (this codebase is comment-free except `// eslint-disable*` directives).
- `default` exports anywhere except React components.
- A type added inline in a component/hook instead of `src/types/shell.d.ts` (e.g. an inline `Window` augmentation).
- A read-only hook that reimplements fetch+subscribe instead of using `useShellState`.
- A one-shot shell call that spawns PowerShell directly instead of `runPowerShell` from `electron/powershell.js`.
- File naming not in camelCase, or a hook file not named after its single exported `useXxx`.
- A renderer hook that calls an **unsubscribe-returning** API but discards the returned function instead of calling it in `useEffect` cleanup. Verify against `preload.js` that the specific method returns `() => …` before flagging: `onStartupChanged`, `onCatalogChanged`, `onConfigChanged`, `onOpenAppsChanged`, `onWifiScanUpdated`, `onBluetoothChanged`, launcher `onCloseMenus`/`onStartClose`/`onHide`, and topbar `onCloseMenus` do return one — but topbar `onColorChanged`/`onForegroundColorChanged` and screenshot/alttab `onHide` return void; do not flag discarding their result.

## Launcher parity for new settings (Nit level)

Alpine Shell mirrors user-adjustable settings into the launcher so they can be changed without opening the Settings window. The registry is `SETTING_COMMANDS` in `src/components/topbar/launcherSettings.tsx`: each entry's `control` is either `{ kind: "navigate", path }` (merely opens a settings page — dispatched via `openSettings` in `launcherPanel.tsx` `activateSetting`) or an inline control that changes the value in place — `{ kind: "toggle", get, set }`, `{ kind: "slider", … }`, or a submenu kind (`wifi`/`bluetooth`/`tray`/`tiling`/`startup`/`power`/`wallpaper`/`emoji`/`brightness`, whose `LauncherXxx` components live in `launcherPanel.tsx`). The inline `toggle`/`slider` kinds call the same `window.*` setter the settings page uses (e.g. `topbar-search-icon` → `window.topbar.setSearchIcon`, `launcherSettings.tsx:79`).

Flag (Nit) a PR that adds a **new user-adjustable settings control** — a toggle/switch (`ToggleRow`), slider, or simple dropdown in a `src/components/settings/*Page.tsx`, usually backed by a new `xxx/…-set` pref handler — but adds **no `SETTING_COMMANDS` entry that changes it directly** (an inline `toggle`/`slider`/submenu control wired to the same setter). Point out that the new option can't be changed from the launcher, name the setter, and name the array to extend (`SETTING_COMMANDS` in `src/components/topbar/launcherSettings.tsx`). A `navigate`-only entry does NOT satisfy this — it opens the page instead of changing the value directly; for a boolean that alone warrants the nit (suggest a `toggle`).

**Preconditions — verify all before flagging:**

- Open `src/components/topbar/launcherSettings.tsx` and confirm no existing `SETTING_COMMANDS` entry — and no inline submenu in `launcherPanel.tsx` (`LauncherTray`, `LauncherTiling`, …) — already changes the same setter. A submenu can cover a value that has no top-level entry, so absence from `SETTING_COMMANDS` alone is not proof.
- The option must map to a simple launcher control (a boolean or a bounded scalar). Do NOT flag management/editor surfaces with no one-shot equivalent: reorder/delete/import (`trayIconsPage`, the wallpaper "mine" manager in `wallpaperPage`), account/OAuth connect-disconnect (`calendarPage`), hotkey rebinding (`hotkeysPage`), colour pickers (`topBarPage`), or the multi-field arrangement editor (`displaysPage`).
- It is a genuinely new option in this PR, not a rename/move of an existing one.

At most one launcher-parity nit per review (pick the most user-facing new option); it counts against the nit cap.

## Test suggestions (Nit; Important only for license/security logic)

When a PR adds or changes **pure, testable logic** in the style this repo unit-tests with `bun test` and co-located tests (`electron/knownApps.test.js`, `modules/startupState.test.js`, `packages/license/src/index.test.ts`), suggest adding/updating a test, naming the function and the co-located `*.test.{js,ts}`. Applies to parsing/formatting helpers, app-matching, state transitions, and `scripts/publish.js` `compareVersionsDescending`. License-key validation / signature verification in `packages/license` is Important (name `index.test.ts`); everything else is Nit and counts against the cap. Never raise a test suggestion for window/display lifecycle, koffi FFI, PowerShell-invoking modules, or IPC wiring. Do not raise it for changes that only touch `isWellFormedKey`/`normalizeKey` formatting.

## Do not flag (intentional patterns)

- IPC shapes that resemble drift but aren't: request-response handlers with no `broadcast` (`launcher/index`), modules with no `start()` (`power.js`), boot-time `ipcMain.on` sync listeners (`wallpaper-init`, `bluetooth-init`, `network/wifi-init`) paired with `ipcRenderer.sendSync`, fire-and-forget `ipcRenderer.send` channels (`topbar/set-active-region`), `useShellState` not capturing a (nonexistent) unsubscriber, and module helper exports (`setShells`, `showFromHotkey`, `setShellAppsProvider`, `refresh`).
- Intentional graceful degradation: empty `catch` in cleanup/finalizers (`DestroyPhysicalMonitors`/`Unhook*`/`koffi.unregister`), brightness probe returning `[]` when dxva2 is absent, `regAdd` to HKLM failing under non-admin, `persistStore` write failures, and `try/catch` around `require()` of optional modules in `main.js`.
- A value wrapped in `quotePs()` (runCommand.js) — its `'/.../g → ''` single-quote escaping is correct. This does not exempt a new unquoted interpolation into the `Start-Process` string.
- Bluetooth `instanceId`/`action` passed to `-File` without Node-side escaping — values come from device enumeration / TS enums and the `.ps1` validates. Do not escalate the network.js SSID reasoning onto Bluetooth by analogy.
- Module-level cache vars, stored `broadcast`/`broadcastRef`, optional chaining on `window.shell?.tray?.*`, and `version` hardcoded `0.1.0` in `package.json` (bumped only by the release workflow).
- Anything CI already enforces: ESLint style, `bun run typecheck` type errors, `bun.lock` / frozen-lockfile.

## Verification & re-review

For cross-layer IPC findings, name the specific file each side is (or isn't) wired in. After the first review of a PR, post Important findings only and suppress new nits; do not re-raise an Important finding the author has explicitly acknowledged. When over the nit cap, give only the count — do not recap each nit in the summary. Open the summary with a one-line verdict ("No blocking issues." if only nits), Important findings first with `file:line`.

# Review instructions

Alpine Shell is a Windows-only Electron desktop shell (main + renderer, Win32 via koffi FFI and PowerShell). Review for correctness that would break the running shell, not style.

## What "Important" (🔴) means here

Reserve 🔴 for changes that would break behavior or destabilize the shell:

- **IPC contract drift** — a new or renamed `ipcMain.handle` channel that isn't wired through all of: `ipc.register(...)` in `electron/main.js`, the matching `window.shell`/`window.topbar` bridge in `electron/preload.js`, and the type in `src/types/shell.d.ts`. Flag any channel present in some layers but not others, and any `window.shell.*` call with no backing handler.
- **PowerShell injection / breakage** — dynamic or user-derived values interpolated into `runPowerShell` command strings or `.ps1` arguments without quoting/escaping. Treat unescaped interpolation into a shell or PowerShell command as Important.
- **FFI safety (koffi / dxva2 / Win32)** — wrong argument or return types, missing null/zero checks on Win32 handles before use, and DDC/CI or device handles that are opened but never freed.
- **Window & process lifecycle** — leaks or dangling references to per-display topbar/desktop windows across display hotplug, broken AppBar work-area registration (`SPI_SETWORKAREA`) that could leave the desktop unusable, or `setIgnoreMouseEvents` cursor-tracking logic that makes the transparent topbar swallow or block clicks.
- **Startup/polling** — a `start(broadcast)` that throws on missing hardware (no external monitor, no battery, no Bluetooth radio) and takes the module or app startup down with it.

Logic errors, broken edge cases, and regressions in the above are Important. Naming, formatting, and refactors are Nit at most.

## Cap the nits

Report at most 6 Nits per review. If there are more, list the count in the summary instead of posting each inline. If everything found is a Nit, open the summary with "No blocking issues."

## Convention checks (Nit level)

Flag newly introduced violations of the repo conventions from CLAUDE.md:

- Code comments (this codebase is intentionally comment-free — prefer descriptive names).
- `default` exports anywhere except React components.
- Type definitions added inline in a component/hook instead of `src/types/shell.d.ts`.
- A read-only hook that reimplements fetch+subscribe instead of using `useShellState`.
- One-shot shell calls that spawn PowerShell directly instead of using `runPowerShell` from `electron/powershell.js`.
- File naming that isn't camelCase, or a hook file not named after its exported function.

## Do not report

- `bun.lock` / lockfiles, and anything CI already enforces (ESLint, `bun run typecheck`).
- Vendored cursor assets under `apps/desktop/public/cursor/` and other binary assets.
- Style nits in `apps/web/` marketing copy.

## Verification bar

Behavior claims need a `file:line` citation in the changed code, not an inference from a function or channel name. For cross-layer IPC findings, name the specific file each side is (or isn't) wired in.

## Re-review

After the first review of a PR, post Important findings only and suppress new nits, so small follow-up pushes don't re-litigate style.

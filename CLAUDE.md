# CLAUDE.md

This file provides context for AI assistants working on the alpine-shell codebase.

## Project Overview

Alpine Shell is a Windows desktop shell replacement built with Electron, React, TypeScript, and Tailwind CSS. It provides a topbar with system controls (volume, brightness, Wi-Fi, Bluetooth) and a desktop wallpaper layer. Windows only — uses Win32 APIs via koffi (FFI) and PowerShell for system integration.

## Repository Layout

This is a Bun-workspaces monorepo. Run all commands from the repo root.

- `apps/desktop/` — the Electron desktop shell (the original app; package name `alpine-shell`). Its build/release config (electron-builder, Railway/MinIO publish) lives in `apps/desktop/package.json`.
- `packages/license/` — `@alpine/license`, the shared license/activation contract (types + key validation) imported by the desktop app.

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
`electron/preload.js` exposes `window.shell` and `window.topbar` APIs via Electron's context bridge. Types are defined globally in `src/types/shell.d.ts`.

## Commands

Run from the repo root; Bun resolves the right workspace via `--filter`.

- `bun start` (or `bun start app`) — Start the full desktop app (Vite dev server + Electron). Replaces `explorer.exe` with Alpine Shell while running.
- `bun run build` — Build the Windows installer (Vite build + electron-builder).
- `bun run release` — Build the installer and publish it to Railway/MinIO.

Desktop-only iteration: `bun --filter alpine-shell dev` (Vite server only), `bun --filter alpine-shell electron` (Electron only; requires Vite already running).

## Code Conventions

- **No code comments. None.** Name functions, variables, and types descriptively instead. This covers every kind: file headers, block comments explaining a design decision, `//` notes above a tricky line, and comments in tests. If a decision needs explaining, it belongs in the commit message or the pull request, where it is read once by a reviewer — not in the file, where it is read forever and rots. If a line needs explaining, rename something until it does not.
- **Single responsibility.** Each function does one thing.
- **DRY.** Use `useShellState` for read-only hooks. Use `runPowerShell` from `electron/powershell.js` for one-shot PowerShell commands.
- **No default exports** except for React components (React convention).
- **Type definitions** go in `src/types/shell.d.ts`, not inline in components or hooks.
- **File naming**: camelCase for all source files. Hook files are named after their exported function (e.g., `useMonitors.ts` exports `useMonitors`).
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

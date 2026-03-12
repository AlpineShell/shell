# CLAUDE.md

This file provides context for AI assistants working on the alpine-shell codebase.

## Project Overview

Alpine Shell is a Windows desktop shell replacement built with Electron, React, TypeScript, and Tailwind CSS. It provides a macOS-inspired topbar with system controls (volume, brightness, Wi-Fi, Bluetooth) and a desktop wallpaper layer. Windows only — uses Win32 APIs via koffi (FFI) and PowerShell for system integration.

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

- `bun start` — Start both Vite dev server and Electron (full app)
- `bun run dev` — Start only the Vite dev server (for frontend iteration)
- `bun run electron` — Start only Electron (requires Vite already running)

## Code Conventions

- **No code comments.** Name functions, variables, and types descriptively instead.
- **Single responsibility.** Each function does one thing.
- **DRY.** Use `useShellState` for read-only hooks. Use `runPowerShell` from `electron/powershell.js` for one-shot PowerShell commands.
- **No default exports** except for React components (React convention).
- **Type definitions** go in `src/types/shell.d.ts`, not inline in components or hooks.
- **File naming**: camelCase for all source files. Hook files are named after their exported function (e.g., `useMonitors.ts` exports `useMonitors`).

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

<img width="2619" height="644" alt="Group 5" src="https://github.com/user-attachments/assets/da942190-f792-437e-95df-42392429ff16" />
<a href="https://alpineshell.com"><img width="8013" height="309" alt="Alpine Shell" src="https://github.com/user-attachments/assets/15f75643-dcb9-48bf-948c-7c92cc6d19b5" /></a>

## Requirements

- Windows 10/11 
- Node.js 18+

## Getting Started

```bash
bun install
bun start   # Windows desktop shell (Vite + Electron)
```

`bun start` launches both the Vite dev server and Electron; the shell appears on all connected displays. The website lives in its own repo: [AlpineShell/website](https://github.com/AlpineShell/website).

## Updates

An installed copy checks `https://auth.alpineshell.com/releases/` with its licence token; a copy whose licence has lapsed is not offered updates until it signs in again. If a packaged build ever refuses to start with an integrity error such as "app failed integrity check", its `app.asar` no longer matches the hash baked into the executable (usually because an update stopped halfway): reinstall from the latest installer, which replaces the files and keeps your settings and licence.

## Code Standards

This project values clean, readable code over documentation:

- **No comments.** Code should be self-documenting through clear naming. If something needs a comment, rename it instead.
- **Single responsibility.** Each function does one thing. If a function name needs "and" in it, split it.
- **DRY.** Shared patterns are extracted into utilities (`useShellState` for hooks, `runPowerShell` for shell commands). Don't over-abstract — if two things look similar but serve different purposes, duplication is fine. 
- **Small files.** Each module, hook, and component lives in its own file.
- **Descriptive names.** `getNetworkStatus` not `getData`. `isRadioEnabled` not `check`.

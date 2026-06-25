<img width="2619" height="644" alt="Group 5" src="https://github.com/user-attachments/assets/da942190-f792-437e-95df-42392429ff16" />
<img width="8013" height="309" alt="MacBook Pro 16_ - 4 (9)" src="https://github.com/user-attachments/assets/15f75643-dcb9-48bf-948c-7c92cc6d19b5" />

# Alpine Shell 
A Windows desktop shell.

## Requirements 

- Windows 10/11 
- Node.js 18+

## Getting Started 

```bash
bun install
bun start app   # Windows desktop shell (Vite + Electron)
bun start web   # marketing & license site (Next.js)
```

`bun start app` launches both the Vite dev server and Electron; the shell appears on all connected displays. `bun start web` runs the Next.js site in `apps/web`. Running `bun start` with no target opens an interactive picker.

## Code Standards

This project values clean, readable code over documentation:

- **No comments.** Code should be self-documenting through clear naming. If something needs a comment, rename it instead.
- **Single responsibility.** Each function does one thing. If a function name needs "and" in it, split it.
- **DRY.** Shared patterns are extracted into utilities (`useShellState` for hooks, `runPowerShell` for shell commands). Don't over-abstract — if two things look similar but serve different purposes, duplication is fine.
- **Small files.** Each module, hook, and component lives in its own file.
- **Descriptive names.** `getNetworkStatus` not `getData`. `isRadioEnabled` not `check`.

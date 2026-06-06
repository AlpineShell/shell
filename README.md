<img width="2619" height="644" alt="Group 5" src="https://github.com/user-attachments/assets/da942190-f792-437e-95df-42392429ff16" />

# Alpine Shell 
A Windows desktop shell.

## Requirements 

- Windows 10/11 
- Node.js 18+

## Getting Started

```bash
bun install
bun start
```

This starts both the Vite dev server and Electron. The shell will appear on all connected displays.

## Code Standards

This project values clean, readable code over documentation:

- **No comments.** Code should be self-documenting through clear naming. If something needs a comment, rename it instead.
- **Single responsibility.** Each function does one thing. If a function name needs "and" in it, split it.
- **DRY.** Shared patterns are extracted into utilities (`useShellState` for hooks, `runPowerShell` for shell commands). Don't over-abstract — if two things look similar but serve different purposes, duplication is fine.
- **Small files.** Each module, hook, and component lives in its own file.
- **Descriptive names.** `getNetworkStatus` not `getData`. `isRadioEnabled` not `check`.

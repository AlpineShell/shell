# Alpine Shell 

A Windows desktop shell.

## Requirements

- Windows 10/11
- Node.js 18+

## Getting Started

```bash
npm install
npm start
```

This starts both the Vite dev server and Electron. The shell will appear on all connected displays.

## Development

```bash
npm start
```

## Code Standards

This project values clean, readable code over documentation:

- **No comments.** Code should be self-documenting through clear naming. If something needs a comment, rename it instead.
- **Single responsibility.** Each function does one thing. If a function name needs "and" in it, split it.
- **DRY.** Shared patterns are extracted into utilities (`useShellState` for hooks, `runPowerShell` for shell commands). Don't over-abstract — if two things look similar but serve different purposes, duplication is fine.
- **Small files.** Each module, hook, and component lives in its own file.
- **Descriptive names.** `getNetworkStatus` not `getData`. `isRadioEnabled` not `check`.

## Contributing

1. Follow the code standards above
2. Test on a Windows machine with at least one display
3. If adding a new system module, see [CLAUDE.md](CLAUDE.md) for the step-by-step guide

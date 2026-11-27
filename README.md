<img width="2619" height="644" alt="Group 5" src="https://github.com/user-attachments/assets/da942190-f792-437e-95df-42392429ff16" />
<a href="https://alpineshell.com"><img width="8013" height="309" alt="Alpine Shell" src="https://github.com/user-attachments/assets/15f75643-dcb9-48bf-948c-7c92cc6d19b5" /></a>

## Requirements 

- Windows 11 
- [Bun](https://bun.sh) 1.3.12, the version CI and releases use (1.3.13 and later can fail a clean install on Windows)
- Node.js 22.12+

## Getting Started

```bash
bun install
bun start   # Windows desktop shell (Vite + Electron)
```

## Updates

An installed copy checks `https://auth.alpineshell.com/releases/` with its licence token about every six hours; the service records nothing from that call. Settings has no switch to turn these checks off. A copy whose licence was refunded, released or revoked keeps running the version it has and is simply not offered updates.

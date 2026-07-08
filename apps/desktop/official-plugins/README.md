# Official plugins

First-party plugins maintained in this repo and published to the Alpine Shell
**marketplace** — they are **not** bundled into the app. Users install them from the
marketplace (or drop them into their plugins folder).

Each subfolder is a full plugin (`plugin.json` v1 + `renderer` + `README.md`), named
by its reverse-DNS `id`. Publish one with:

```bash
cd apps/desktop
# .env has STORAGE_* pointing at the alpine-plugins bucket
bun run publish:plugin official-plugins/<id>
```

Bundled first-party plugins that ship *inside* the app instead live in
`apps/desktop/presets/plugins/`; tutorial examples live in `apps/desktop/examples/plugins/`.

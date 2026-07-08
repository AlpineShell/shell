# Getting started · your first plugin

A plugin is a **self-describing folder** you drop into Alpine Shell. It is not part of the app build — the shell ships a loader that scans a directory on startup and loads whatever plugins it finds. You can write one in five minutes, with no build step.

## What a plugin is

Every plugin lives in its own folder and describes itself with a single `plugin.json` manifest. From that manifest alone the shell builds the topbar registry, the settings pages, the launcher commands and the consent UI — **before any of your code runs**. Your code only runs once the shell decides to load the plugin.

During development a plugin runs **in-process** with the shell's React runtime. This is *Tier A* — full trust, no sandbox. Only load plugins you wrote or reviewed. The security model is covered in [Permissions & the security model](/docs/permissions-security).

## Where plugins live

```
%APPDATA%\Alpine Shell\plugins\<your-plugin>\
```

Open this folder from **Settings → Plugins → Open plugins folder**. The folder name is the plugin's id. For a dropped-in plugin the id must be lowercase and use only `a-z`, `0-9`, `.`, `_`, `-` (for example `weather` or `com.me.clock`). Published plugins use a **reverse-DNS id** such as `com.example.weather`.

## The three load-bearing files

A no-build plugin needs as few as two files. A published plugin adds a README for its store listing:

```
weather/
  plugin.json    the manifest — id, name, what it contributes, what it needs
  index.js       your renderer code (the widget)
  README.md      long description shown on the marketplace detail page
```

### 1. `plugin.json`

The manifest. At minimum it names the plugin and points at your renderer. See the full [manifest reference](/docs/manifest-reference).

```json
{
  "id": "com.me.weather",
  "name": "Weather",
  "version": "0.1.0",
  "apiVersion": 1,
  "renderer": "index.js",
  "contributes": {
    "topbarWidgets": [{ "export": "TopbarWeather", "slot": "right", "order": 20 }]
  },
  "permissions": ["storage"]
}
```

### 2. Your renderer code

The classic no-build path uses the `window.alpine` runtime that the host publishes. `h` is `React.createElement` (there is no JSX because there is no build step); every hook is the host's own React instance, so hooks behave normally.

```js
const { h, useState, useDarkText } = window.alpine

function TopbarWeather() {
  const dark = useDarkText()          // follows the topbar's light/dark text
  const [temp] = useState("21°")
  return h("span", { style: { fontSize: "12px", padding: "0 6px" } }, temp)
}

window.alpine.register({
  type: "topbar-widget",
  id: "weather",
  component: TopbarWeather,
  slot: "right",
  order: 20,
})
```

If you'd rather write JSX and TypeScript, use the `@alpine/plugin-sdk` and a Vite build — see [The @alpine/plugin-sdk API](/docs/sdk-api). Either way the emitted renderer resolves React and the SDK from the host at runtime, so there is exactly one React instance.

## The reload loop

1. **Settings → Plugins → Open plugins folder.**
2. Copy your plugin folder in.
3. **Settings → Plugins → Reload plugins** — your widget appears in the topbar. No restart needed.

Every plugin — dropped-in or a bundled **preset** — can be toggled on and off in **Settings → Plugins**. The disabled set persists in `pluginState.json` under your user data, so a disabled plugin stays disabled across restarts.

## Next steps

- Learn every manifest field in the [manifest reference](/docs/manifest-reference).
- See what your plugin can contribute in [Contribution surfaces](/docs/contribution-surfaces).
- Understand what you can ask for in [Permissions & the security model](/docs/permissions-security).
- When it's ready, read [Publishing to the marketplace](/docs/publishing).

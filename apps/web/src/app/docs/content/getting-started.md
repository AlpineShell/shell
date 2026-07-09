# Getting started · your first plugin

A plugin is a **self-describing folder** that Alpine Shell loads at runtime. There is no build step required and no need to rebuild the app — you write a folder, drop it in, and reload. You can have a widget in your topbar in five minutes.

## The two kinds of plugin

There are exactly two ways a plugin gets onto a machine:

| | **Custom plugin** | **Official plugin** |
|---|---|---|
| Who makes it | You — or anyone | The Alpine Shell team |
| How it's installed | Drop the folder into your plugins directory, then **Reload** | One click from **Settings → Plugins → Browse**, or the **Install in Alpine Shell** button on the website |
| Where it comes from | Your own machine | The curated marketplace catalog |
| Signed | No | Yes — Ed25519, signed by the Alpine Shell team |

**This guide is about writing a custom plugin** — the path anyone can use today. Only **official** plugins can be installed with one click; the marketplace is first-party only. To run a plugin you wrote, you drop its folder in (steps below). When you want to hand it to someone else, see [Sharing your plugin](/docs/publishing).

> A custom plugin runs **in-process** with the shell's React runtime — full trust, no sandbox (*Tier A*). Only load plugins you wrote or reviewed.

## Build your first plugin

### 1. Make a folder

Name the folder after your plugin's `id`. Every id is **reverse-DNS and lowercase** — dot-separated segments of `a-z`, `0-9` and `-`, with **at least one dot** (e.g. `com.you.weather`). A single bare word like `weather` is rejected, and so is anything with an underscore. A no-build plugin needs just two files:

```
com.you.weather/
  plugin.json    the manifest — id, name, what it contributes
  index.js       your renderer code (the widget)
```

### 2. Write `plugin.json`

The manifest names the plugin and points at your renderer. From it alone the shell builds the topbar, settings and launcher entries — **before any of your code runs**. See the full [manifest reference](/docs/manifest-reference).

```json
{
  "id": "com.you.weather",
  "name": "Weather",
  "version": "0.1.0",
  "apiVersion": 1,
  "renderer": "index.js",
  "contributes": {
    "topbarWidgets": [{ "export": "TopbarWeather", "slot": "right", "order": 20 }]
  }
}
```

The `id` **must equal the folder name** (case-insensitive).

### 3. Write the renderer

No bundler needed: the host publishes a `window.alpine` runtime. `h` is `React.createElement` (there is no JSX because there is no build step); every hook is the host's own React instance, so hooks behave normally.

```js
const { h, useState, useDarkText } = window.alpine

function TopbarWeather() {
  const dark = useDarkText()          // follows the topbar's light/dark text
  const [temp] = useState("21°")
  return h("span", { style: { fontSize: "12px", padding: "0 6px" } }, temp)
}

window.alpine.register({
  type: "topbar-widget",
  id: "weather",                       // this widget's own id, not the plugin id
  component: TopbarWeather,
  slot: "right",
  order: 20,
})
```

Prefer JSX and TypeScript? Use `@alpine/plugin-sdk` with its Vite preset instead — see [The @alpine/plugin-sdk API](/docs/sdk-api). Either way the emitted renderer resolves React from the host at runtime, so there is exactly one React instance.

### 4. Drop it in

1. Open **Settings → Plugins**. On the **Installed** tab, click **Open plugins folder** — it opens `%APPDATA%\Alpine Shell\plugins\`.
2. Copy your `com.you.weather/` folder into it.
3. Click **Reload**.

Your widget appears in the topbar — no restart. That is your whole dev loop: **edit → Reload → see the change**. Every reload re-scans the folder.

### 5. Toggle and iterate

Every plugin can be switched on and off on the **Installed** tab. The disabled set persists in `pluginState.json` under your user data, so a disabled plugin stays disabled across restarts.

## Next steps

- Learn every manifest field in the [manifest reference](/docs/manifest-reference).
- See what your plugin can contribute in [Contribution surfaces](/docs/contribution-surfaces).
- Hand it to other people in [Sharing your plugin](/docs/publishing).

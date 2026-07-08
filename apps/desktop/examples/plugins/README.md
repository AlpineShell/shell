# Writing an Alpine Shell plugin

A plugin is a folder you drop into the shell's plugins directory at runtime. It is **not** part of
the app build — the app ships a loader, and loads whatever folders it finds on startup.

> **Trust:** plugins run with the shell's full privileges (same as the app itself). Only add plugins
> you have written or reviewed. This is a curated model — there is no sandbox.

## Where plugins live

`%APPDATA%\Alpine Shell\plugins\<your-plugin>\`

Open it from **Settings → Plugins → Open plugins folder**. Folder names must be lowercase and use only
`a-z`, `0-9`, `.`, `_`, `-` (e.g. `weather`, `com.me.clock`). The folder name is the plugin's id.

## Minimum files

A plugin is two text files. No build step, no bundler, no npm install.

```
weather/
  plugin.json    { "name": "Weather", "entry": "index.js" }
  index.js       the code
```

`plugin.json` fields (all optional):

| Field   | Default      | Meaning                          |
|---------|--------------|----------------------------------|
| `name`  | folder name  | Display name in Settings         |
| `entry` | `index.js`   | The module the loader imports    |

## The code

Your entry module runs when the shell loads it. Use the `window.alpine` runtime (host React, hooks,
theme) and call `window.alpine.register(...)` to contribute a widget.

```js
const { h, useState, useEffect, useDarkText } = window.alpine

function MyWidget() {
  const dark = useDarkText()          // follows the topbar's light/dark text
  const [value, setValue] = useState('hi')
  return h('span', { style: { fontSize: '12px', padding: '0 6px' } }, value)
}

window.alpine.register({
  type: 'topbar-widget',
  id: 'my-widget',
  component: MyWidget,
  slot: 'right',                      // 'left' | 'center' | 'right'
  order: 20,                          // lower = further from the clock
})
```

`h` is `React.createElement` — there's no JSX because there's no build step. Everything else
(`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`) is the host's React, so hooks work
normally. `useDarkText()` / `useTopbarBg()` give you the current topbar theme.

## Host data (`usePluginData`)

The renderer can't read files or run system code directly. Instead, first-party host modules publish
read-only **data channels** that a widget subscribes to with `usePluginData(channel, initial)` — it
fetches the current value and re-renders whenever the host broadcasts an update. The bundled
`claude-code-usage` preset uses the `claude-usage` channel:

```js
const { h, usePluginData } = window.alpine
const usage = usePluginData('claude-usage', null)   // { blockCost, blockTokens, todayCost, ... }
```

## Dropdowns (`PopupMenu`)

The topbar is a transparent 24px strip, so a widget can't just overflow with a `<div>`. Use the
host's `PopupMenu` — the one sanctioned dropdown surface — to show details on hover:

```js
const { h, PopupMenu } = window.alpine
return h(PopupMenu, { trigger: h('span', null, 'Menu') }, h('div', null, 'panel contents'))
```

## Presets

First-party plugins that ship *with* Alpine live in `apps/desktop/presets/plugins/<id>/` and are
bundled read-only via electron-builder `extraResources`. They load exactly like a dropped-in plugin
and appear in **Settings → Plugins** with a **Preset** badge. Every plugin — preset or dropped-in —
can be toggled on/off there; the disabled set persists in `pluginState.json` under userData.

## The loop

1. Settings → Plugins → **Open plugins folder**.
2. Copy your plugin folder in (try the `weather` folder next to this README).
3. Settings → Plugins → **Reload plugins** — your widget appears in the topbar. No restart needed.

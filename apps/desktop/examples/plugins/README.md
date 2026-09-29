# Writing an Alpine Shell plugin

A plugin is a folder you drop into the shell's plugins directory at runtime. It is **not** part of
the app build — the app ships a loader and loads whatever folders it finds on startup.

> **Trust:** plugins run with the shell's full privileges (same as the app itself). Only add plugins
> you have written or reviewed — there is no sandbox.

Full docs: **[/docs/plugins/getting-started](https://alpineshell.com/docs/plugins/getting-started)**. This
folder holds a runnable example (`com.alpine.weather/`).

## Where plugins live

`%APPDATA%\Alpine Shell\plugins\<your-plugin>\` — open it from **Settings → Plugins → Open plugins
folder**. The folder name is the plugin's id, so a folder called `weather` just works.

## Two files, no build

```
weather/
  plugin.json    { "name": "Weather", "contributes": { "topbarWidgets": [{ "slot": "right" }] } }
  index.js       export default a component
```

Nothing is required but `name` and what the plugin contributes. `id` defaults to the folder name,
`renderer` defaults to `index.js`, and each contribution mounts your module's `export default` (or a
named export via `"export"`). You never call a register function — the manifest is the source of truth.

## The code

Use the `window.alpine` runtime (host React + hooks + theme) and write JSX-like markup with `html`
(a tagged template — no build step, no bundler):

```js
const { html, useState, useEffect, useDarkText } = window.alpine

export default function Weather() {
  const dark = useDarkText()          // follows the topbar's light/dark text
  const [temp, setTemp] = useState('21°')
  return html`<span style=${{ fontSize: 12, padding: '0 6px' }}>${temp}</span>`
}
```

Two `html` rules: interpolate a **component** as `` html`<${MyComponent} />` `` (a bare `<MyComponent>`
becomes the string `"mycomponent"`), and never mutate a returned element (they're cached and reused).
Prefer `h` (`React.createElement`) if you'd rather skip the template. Everything on `window.alpine`
comes from the host's single React: `useState`/`useEffect`/`useRef`/`useMemo`/`useCallback`/`useReducer`/
`useContext`, `useDarkText()`/`useTopbarBg()`, and a `store` (zustand) for shared state across views.

## Host data (`usePluginData`)

A renderer can't touch the filesystem. Backends publish read-only **data channels**; a widget reads one
with `usePluginData(channel, initial)` and re-renders on every update. The Claude usage plugin's widget
reads the `claude-usage` channel its own backend publishes:

```js
const { usePluginData } = window.alpine
const usage = usePluginData('claude-usage', null)   // { ok, sessionPercent, limits, ... }
```

## Backend state (`ctx.dataDir`)

An update replaces the plugin folder (`ctx.pluginDir`) whole. A backend keeps its own files in
`ctx.dataDir` (`%APPDATA%\Alpine Shell\plugin-data\<id>\`): the host creates it before the backend
starts, an update leaves it alone, and an uninstall removes it.

## Settings (`contributes.settings`)

Declare toggles, selects and sliders in `plugin.json` and the shell draws them: in your widget's Ridge
callout (Settings → Ridge → click your widget) and on your plugin's own settings page (the gear on its
row in Settings → Plugins). The shell stores the values and falls back to `default`.

```json
"contributes": {
  "topbarWidgets": [{ "slot": "right" }],
  "settings": [
    { "key": "unit", "type": "select", "label": "Unit", "default": "c",
      "options": [{ "value": "c", "label": "Celsius" }, { "value": "f", "label": "Fahrenheit" }] },
    { "key": "showWind", "type": "toggle", "label": "Show wind", "info": "Adds the wind speed.", "default": false },
    { "key": "refresh", "type": "slider", "label": "Refresh every", "default": 10, "min": 5, "max": 60, "step": 5, "unit": "min" }
  ],
  "settingsPages": [{ "label": "Weather", "export": "WeatherSettings", "topLevel": true }]
}
```

`usePluginSetting(pluginId, key)` returns `[value, setValue]` and re-renders when the value changes
anywhere. A backend reads `ctx.settings.get(key)` and listens with `ctx.settings.onChange((key, value) => …)`.

```js
const { usePluginSetting } = window.alpine
const [unit] = usePluginSetting('com.alpine.weather', 'unit')
```

`settingsPages` is optional: a plugin with `settings` gets a page named after it. Declare one to rename the
page, list it in the sidebar (`topLevel`), or render your own component (`export`) below the rows.

## Dropdowns (`PopupMenu`)

The topbar is a transparent 24px strip, so a widget can't overflow with a plain element. Use the host's
`PopupMenu` for a panel below it:

```js
const { html, PopupMenu } = window.alpine
return html`<${PopupMenu} trigger=${html`<span>Menu</span>`}><div>panel</div><//>`
```

## The loop

1. Settings → Plugins → **Open plugins folder**.
2. Copy your plugin folder in (try `com.alpine.weather/` next to this README).
3. Settings → Plugins → **Reload plugins** — your widget appears in the topbar. No restart needed.

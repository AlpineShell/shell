# Getting started: your first plugin

A plugin is a folder that Alpine Shell loads at runtime. No build step, no scaffolding, no rebuild of the app; two small files put a widget in your topbar.

## 1. Create the folder

Make a folder for your plugin. The folder name becomes the plugin's id, so name it reverse-DNS style:

```
com.you.weather/
  plugin.json    what the plugin adds to the shell
  index.js       the component
```

## 2. Write `plugin.json`

The manifest declares what your plugin contributes. That's all it has to say: the id comes from the folder, the entry module defaults to `index.js`, and version fields are optional:

```json
{
  "name": "Weather",
  "contributes": {
    "topbarWidgets": [{ "slot": "right" }]
  }
}
```

This reads: render my default export as a widget in the topbar's right slot.

## 3. Write `index.js`

The shell exposes its runtime on `window.alpine`. `html` is a JSX-like tagged template, and the hooks are the shell's own React, so they behave exactly as you expect:

```js
const { html } = window.alpine

export default function Weather() {
  return html`<span>21°</span>`
}
```

No registration call, no boilerplate; the manifest maps your export to the slot.

## 4. Drop it in

1. Open **Settings → Plugins** and click **Open plugins folder** (it opens `%APPDATA%\Alpine Shell\plugins\`).
2. Copy `com.you.weather/` into it.
3. Click **Reload**.

Your widget appears in the topbar. That's the whole dev loop from here: **edit → Reload → see the change**.

## 5. Make it real

Fetch live data with the hooks from `window.alpine`:

```js
const { html, useState, useEffect, useDarkText } = window.alpine

export default function Weather() {
  const dark = useDarkText()
  const [temp, setTemp] = useState(null)

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=47.37&longitude=8.54&current=temperature_2m")
      .then((res) => res.json())
      .then((data) => setTemp(Math.round(data.current.temperature_2m)))
      .catch(() => {})
  }, [])

  return html`<span style=${{ fontSize: "12px", padding: "0 6px", color: dark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.85)" }}>
    ${temp === null ? "-" : `${temp}°C`}
  </span>`
}
```

`useDarkText()` keeps your text readable as the topbar switches between light and dark backgrounds.

Every plugin can be toggled on and off on the **Installed** tab; the setting persists across restarts.

## Next steps

- Add settings pages and launcher commands: [Contribution points](/docs/plugins/contributions)
- Poll an API or read files from a background process: [Add a backend](/docs/plugins/backend)
- Graduate to TypeScript and JSX with a build: [Plugin SDK reference](/docs/plugins/sdk)
- Every manifest field and its default: [Manifest reference](/docs/plugins/manifest)
- Hand it to other people: [Publishing your plugin](/docs/plugins/publishing)

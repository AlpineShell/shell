# Plugin SDK reference

There are two ways to write a renderer, and they share one API:

- **No build**: read everything off `window.alpine` and write components with the `html` tagged template. This is the default path; a plugin is two plain files.
- **With a build**: import the same surface from `@alpine/plugin-sdk`, write TSX, and bundle with the provided Vite preset.

Either way your components run on the shell's own React instance, so hooks, context and state behave normally.

## The `window.alpine` runtime

| Export | Kind | What it does |
|---|---|---|
| `html` | tagged template | JSX-like templating (htm bound to the host React). The default way to render. |
| `h` | function | `React.createElement`, if you prefer calls over templates. |
| `Fragment` | component | React fragment for multi-root returns. |
| `useState` `useEffect` `useRef` `useMemo` `useCallback` `useReducer` `useContext` | hooks | The host React's hooks. |
| `store` | object | `{ createStore, useStore }`: shared state across your plugin's components (below). |
| `usePluginData(channel, initial)` | hook | Latest value from a [backend](/docs/plugins/backend) data channel; re-renders on every publish. |
| `useDarkText()` | hook | `true` when the topbar wants dark text (light background). |
| `useTopbarBg()` | hook | The current topbar background color. |
| `PopupMenu` | component | The sanctioned dropdown: give it a `trigger` and children, it renders a panel below the 24px strip. |

### Writing markup with `html`

`html` looks like JSX with two differences worth knowing:

1. **Interpolate components.** A component goes into the template as an interpolation, not a bare tag name: `<${Comp} />`, or `<${Comp}>children<//>` with children.
2. **Don't mutate returned elements.** Static parts of a template are cached and reused across renders; treat everything `html` returns as immutable and drive changes through props and state.

```js
const { html, PopupMenu, useDarkText } = window.alpine

export default function Clock() {
  const dark = useDarkText()
  return html`
    <${PopupMenu} trigger=${html`<span style=${{ color: dark ? "#000" : "#fff" }}>12:00</span>`}>
      <div>Calendar goes here</div>
    <//>
  `
}
```

### Shared state with `store`

`createStore` holds state outside any one component; `useStore` subscribes to it. Use it when several of your contributions (say a topbar widget and a settings page) need the same value:

```js
const { html, store } = window.alpine
const city = store.createStore("Zurich")

export default function WeatherWidget() {
  const [value] = store.useStore(city)
  return html`<span>${value}</span>`
}

export function WeatherSettings() {
  const [value, setValue] = store.useStore(city)
  return html`<input value=${value} onInput=${(e) => setValue(e.target.value)} />`
}
```

Create stores at module top level, once. Any component that calls `useStore(store)` re-renders when the value changes.

## `@alpine/plugin-sdk`: the typed mirror

The npm package mirrors the runtime as typed imports; nothing extra ships to the user, because the build externalizes it all back to the host.

- `@alpine/plugin-sdk/hooks`: `usePluginData`, `usePluginSetting(key, default)` (a persisted per-plugin setting as `[value, set]`), `useDarkText`, `useTopbarBg`, `useTopbarTheme`, `PopupMenu`.
- `@alpine/plugin-sdk/react` and `/jsx-runtime`: the host-bound React and JSX runtime. Import these instead of `react` so there is exactly one React instance.
- `@alpine/plugin-sdk` (root): manifest types and validation helpers, useful in tests and tooling.

## Graduating to TSX

When a plugin outgrows two files, add a build. The Vite preset wires the JSX runtime to the SDK and externalizes React and the SDK itself:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { alpinePluginPreset } from "@alpine/plugin-sdk/vite"

export default defineConfig(alpinePluginPreset({ entry: "src/renderer.tsx" }))
```

```tsx
// src/renderer.tsx
import { usePluginSetting, PopupMenu } from "@alpine/plugin-sdk/hooks"

export default function Weather() {
  const [city, setCity] = usePluginSetting("city", "Zurich")
  return (
    <PopupMenu trigger={<span>{city}</span>}>
      <div>Weather for {city}</div>
    </PopupMenu>
  )
}
```

The build emits `dist/renderer.js`; point the manifest at it:

```json
{ "name": "Weather", "renderer": "dist/renderer.js", "contributes": { "topbarWidgets": [{ "slot": "right" }] } }
```

Your dev loop stays the same: build, then **Reload** in Settings → Plugins.

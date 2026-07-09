# The @alpine/plugin-sdk API

`@alpine/plugin-sdk` is the typed author surface for Alpine Shell plugins. It gives you React hooks, the topbar theme, the `PopupMenu` dropdown, and a Vite preset — all bound to the **host's** React instance so there is exactly one React in the process.

You can write a plugin without the SDK using the legacy `window.alpine` runtime (see below), but the SDK gives you JSX, TypeScript and named imports.

## Two ways to write a plugin

### With a build (SDK + Vite) — recommended

Import from the SDK and build with the provided Vite preset. React, the JSX runtime and the SDK itself are externalized, so the emitted `renderer.js` resolves them from the host at runtime.

```tsx
import { usePluginSetting, useDarkText, PopupMenu } from "@alpine/plugin-sdk/hooks"

export function TopbarWeather() {
  const dark = useDarkText()
  const [city, setCity] = usePluginSetting("city", "Zurich")
  return (
    <PopupMenu trigger={<span>{city}</span>}>
      <div>Weather for {city}</div>
    </PopupMenu>
  )
}
```

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { alpinePluginPreset } from "@alpine/plugin-sdk/vite"

export default defineConfig(alpinePluginPreset({ entry: "src/renderer.tsx" }))
```

### Without a build (`window.alpine`) — today's shipped path

The host publishes a `window.alpine` runtime. `h` is `React.createElement`; the hooks are the host's own React. No import, no bundler.

```js
const { h, useState, usePluginData, useDarkText, PopupMenu } = window.alpine
```

This is the path the first-party `com.alpine.claude-code-usage` plugin uses today. The SDK is a thin, typed wrapper over the same runtime.

## Export table

From `@alpine/plugin-sdk/hooks` (renderer-only, ESM):

| Export | Kind | What it does |
|---|---|---|
| `usePluginSetting(key, default)` | hook | Returns `[value, setValue]` for a setting private to your plugin. Optimistic; persists across restarts. |
| `usePluginData(channel, initial)` | hook | Subscribes to a read-only host **data channel** and re-renders on every broadcast. |
| `useShell()` | hook | The host shell object. **Gated**: resolves to an empty object today; the host exposes no shell surface yet. |
| `useDarkText()` | hook | `true` when the topbar wants dark text (light background). |
| `useTopbarBg()` | hook | The current topbar background color. |
| `useTopbarTheme()` | hook | `{ dark, bg }` in one call. |
| `PopupMenu` | component | The one sanctioned dropdown. Give it a `trigger` and children; it renders a panel outside the 24px strip. |

From `@alpine/plugin-sdk/react` and `/jsx-runtime`: the host-bound React hooks (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, `useReducer`, `useContext`, `createElement`, `Fragment`) and the real `jsx`/`jsxs`/`Fragment` values. Use these instead of importing `react` directly so you share the host's instance.

From `@alpine/plugin-sdk/vite`: `alpinePluginPreset({ entry, outDir? })` — a ready-made Vite config that emits a single `renderer.js` + `renderer.css` with React and the SDK externalized.

## Reading host data

The renderer can't read files or run system code directly. First-party host modules publish read-only **data channels**; a widget subscribes with `usePluginData`. For example, the `com.alpine.claude-code-usage` plugin reads the `claude-usage` channel:

```js
const { h, usePluginData } = window.alpine
const usage = usePluginData("claude-usage", null) // { ok, sessionPercent, sessionResetsAtMs, limits, subscriptionType, updatedAtMs }
```

## Dropdowns with `PopupMenu`

Because the topbar is a transparent 24px strip, a widget can't overflow with a normal element. `PopupMenu` renders a panel in a proper layer:

```js
const { h, PopupMenu } = window.alpine
return h(PopupMenu, { trigger: h("span", null, "Menu") }, h("div", null, "panel contents"))
```

> Always read the host lazily inside a component or hook call — don't destructure `window.alpine` at module top level, to avoid hot-reload and StrictMode races.

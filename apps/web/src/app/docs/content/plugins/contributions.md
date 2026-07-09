# Contribution points

The `contributes` block in [`plugin.json`](/docs/plugins/manifest) declares everything your plugin adds to the shell. Each entry maps a component from your renderer module to a place in the UI; there is no imperative registration. The shell reads the manifest, builds its topbar, settings and launcher registries, and only then loads your code.

## How exports map to contributions

By default a contribution renders your module's **default export**:

```json
"topbarWidgets": [{ "slot": "right" }]
```

```js
export default function Weather() { … }
```

A plugin that contributes more than one component names them with `export`:

```json
"topbarWidgets": [
  { "export": "UsageBar", "slot": "left" }
],
"settingsPages": [
  { "export": "UsageSettings", "label": "Usage" }
]
```

```js
export function UsageBar() { … }
export function UsageSettings() { … }
```

Every contribution also accepts an optional `since` (integer): the `apiVersion` the entry was introduced in. A host older than `since` skips the entry instead of failing the plugin.

## `topbarWidgets`

A small component rendered in the topbar strip.

| Field | Type | Default | Notes |
|---|---|---|---|
| `export` | string | default export | Named export to render. |
| `slot` | `"left" \| "center" \| "right"` | required | Which region of the topbar. |
| `order` | number | registration order | Lower sorts first within the slot. |
| `displayScope` | `"primary" \| "all"` | `"all"` | `"primary"` renders only on the primary display's topbar. |

The topbar is a transparent 24px strip, so a widget can't overflow with a plain element. To open a panel on click, use `PopupMenu` from the runtime (see the [SDK reference](/docs/plugins/sdk)).

```json
"topbarWidgets": [
  { "slot": "right", "order": 20, "displayScope": "primary" }
]
```

## `settingsPages`

A page inside the shell's Settings window.

| Field | Type | Default | Notes |
|---|---|---|---|
| `export` | string | default export | Named export to render. |
| `label` | string | required | The nav label. |
| `icon` | string | – | `assets/…` file or `lucide:Name`. |
| `path` | string | – | Namespaced by the host to `plugin/<id>/<path>`. |
| `topLevel` | boolean | `false` | Show as a top-level Settings entry instead of nested under Plugins. |

```json
"settingsPages": [
  { "export": "WeatherSettings", "label": "Weather", "icon": "lucide:CloudSun", "topLevel": true }
]
```

## `launcherCommands`

An entry in the launcher (the command palette).

| Field | Type | Default | Notes |
|---|---|---|---|
| `export` | string | default export | The export that implements the command. |
| `kind` | `"action" \| "provider"` | required | `action` runs one command; `provider` supplies a dynamic result list. |
| `title` | string | – | Shown for an `action`. |
| `keywords` | string[] | – | Extra search terms. |

```json
"launcherCommands": [
  { "kind": "action", "export": "refreshWeather", "title": "Refresh weather", "keywords": ["weather", "refresh"] }
]
```

## Backends

A background process is not a `contributes` entry; declare it with the top-level `main` field in the manifest. See [Add a backend](/docs/plugins/backend).

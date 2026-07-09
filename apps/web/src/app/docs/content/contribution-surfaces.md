# Contribution surfaces

The `contributes` block in your [manifest](/docs/manifest-reference) lists everything your plugin adds to the shell. Each entry names an `export` from your renderer module and, optionally, a `since` API version so the host can safely ignore surfaces added in a newer contract.

Every contribution shares two base fields:

| Field | Type | Notes |
|---|---|---|
| `export` | string | The named export from your `renderer` module that implements this surface. |
| `since` | integer | Optional. The `apiVersion` this surface was introduced in. Surfaces newer than the host are ignored, not errors. |

## `topbarWidgets`

A small component that lives in the topbar strip.

| Field | Type | Notes |
|---|---|---|
| `slot` | `"left" \| "center" \| "right"` | Which region of the topbar to render in. |
| `order` | number | Optional. Lower is further from the clock; ties break by registration order. |
| `displayScope` | `"primary" \| "all"` | Optional, default `"all"`. `"primary"` renders only on the primary display's topbar. |

The topbar is a transparent 24px strip. A widget **cannot** overflow with a plain `<div>` — to show a panel on hover or click you must use the SDK's `PopupMenu`, the one sanctioned dropdown surface. See [The @alpine/plugin-sdk API](/docs/sdk-api).

```json
"topbarWidgets": [
  { "export": "TopbarWeather", "slot": "right", "order": 20, "displayScope": "primary" }
]
```

## `settingsPages`

A page inside the shell's Settings window, namespaced to your plugin.

| Field | Type | Notes |
|---|---|---|
| `label` | string | The nav label. |
| `icon` | string | Optional. `assets/…` or `lucide:Name`. |
| `path` | string | Optional. The host namespaces it to `plugin/<id>/<path>`. |
| `topLevel` | boolean | Optional. Surface it as a top-level Settings entry instead of nested under Plugins. |

```json
"settingsPages": [
  { "export": "WeatherSettings", "label": "Weather", "icon": "lucide:CloudSun", "topLevel": true }
]
```

## `launcherCommands`

An entry in the launcher (the command palette).

| Field | Type | Notes |
|---|---|---|
| `kind` | `"action" \| "provider"` | `action` is a single command; `provider` supplies a dynamic list of results. |
| `title` | string | Optional. Shown for an `action`. |
| `keywords` | string[] | Optional. Extra search terms. |

```json
"launcherCommands": [
  { "kind": "action", "export": "refreshCommand", "title": "Refresh weather", "keywords": ["weather", "refresh"] }
]
```

## `backendModules`

Declares a backend (`main`) entry point that runs its own Node process.

| Field | Type | Notes |
|---|---|---|
| `export` | string | The export the supervisor runs. |

Backend modules are **gated**: a plugin's `main` is validated for containment but is never executed until the plugin is signed and shipped by the Alpine Shell team and the backend supervisor lands. Until then, treat backend modules as declaration-only.

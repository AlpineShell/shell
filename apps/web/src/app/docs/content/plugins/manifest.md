# Manifest reference (plugin.json)

`plugin.json` is the plugin's one discovery file. The shell reads it to build the topbar, settings and launcher registries (and the marketplace listing) before any plugin code runs. Almost every field has a sensible default; a minimal manifest is just a `name` and a `contributes` block.

## Top-level fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `$schema` | string | – | `https://alpine.dev/schemas/plugin-v1.json` for editor autocomplete. |
| `id` | string | **the folder name** | Reverse-DNS, lowercase: dot-separated segments of `a-z 0-9 -` (e.g. `com.you.weather`). If set, it must equal the folder name (case-insensitive). |
| `name` | string | the folder name | Display name. Set it. |
| `version` | string | `0.0.0` | [Semver 2.0.0](https://semver.org). Optional locally; required to publish. |
| `apiVersion` | integer | current API | The contribution-contract version. Set it only to pin an older contract. |
| `engines.alpineShell` | semver range | – | e.g. `^0.2.0`. The host compat-gates against its own version. |
| `renderer` | rel path | `index.js` | The ESM module your components are exported from. |
| `main` | rel path | – | CommonJS backend entry, run in an isolated background process. See [Add a backend](/docs/plugins/backend). |
| `contributes` | object | `{}` | What the plugin adds to the shell. See [Contribution points](/docs/plugins/contributions). |
| `icon` | string | – | `assets/icon.png` (a file in the plugin) or `lucide:CloudSun` (a Lucide icon). |
| `description` | string | – | One-line summary. |
| `author` | object | – | `{ name, url?, email? }`. |
| `homepage` | string | – | Project URL. |
| `repository` | string | – | Source URL. |
| `license` | string | – | SPDX identifier, e.g. `MIT`. |
| `marketplace` | object | – | Store-listing metadata (below). |

Inside `contributes`, each entry's `export` defaults to your module's **default export**; you only name exports when one module contributes several components.

## The `marketplace` block

Presentational metadata for the store listing and the in-app detail view. Only relevant once you [publish](/docs/plugins/publishing).

| Field | Type | Default | Notes |
|---|---|---|---|
| `displayName` | string | `name` | Store title. |
| `logo` | rel path | – | Wordmark or banner, distinct from `icon`. |
| `shortDescription` | string | – | Card subtitle, max 120 chars. |
| `readme` | rel path | – | Long-description markdown, e.g. `"README.md"`. Rendered, never executed. |
| `screenshots` | `{ src, caption?, dark? }[]` | – | Each `src` is an image inside the plugin folder. |
| `category` | enum | – | One of `productivity`, `system`, `media`, `developer`, `social`, `fun`, `other`. |
| `keywords` | string[] | – | Search terms. |

## Validation rules

- If `id` is set it must match the reverse-DNS pattern **and** equal the folder name (case-insensitive).
- Every referenced file (`renderer`, `main`, `icon`, and all `marketplace` assets) must exist inside the plugin folder. Absolute paths, `..` segments and symlinks that escape the folder are rejected.
- An incompatible `apiVersion` or `engines.alpineShell` doesn't hide the plugin: it still lists in Settings with the reason shown, but won't load.

## Complete example

```json
{
  "$schema": "https://alpine.dev/schemas/plugin-v1.json",
  "id": "com.example.weather",
  "name": "Weather",
  "version": "0.1.0",
  "engines": { "alpineShell": "^0.2.0" },
  "description": "Current conditions in your topbar.",
  "author": { "name": "Example", "url": "https://example.dev" },
  "homepage": "https://example.dev/weather",
  "repository": "https://github.com/example/alpine-weather",
  "license": "MIT",
  "icon": "lucide:CloudSun",
  "renderer": "dist/renderer.js",
  "main": "backend.js",
  "contributes": {
    "topbarWidgets": [
      { "export": "TopbarWeather", "slot": "right", "order": 20, "displayScope": "primary" }
    ],
    "settingsPages": [
      { "export": "WeatherSettings", "label": "Weather", "icon": "lucide:CloudSun", "topLevel": true }
    ],
    "launcherCommands": [
      { "kind": "action", "export": "refreshWeather", "title": "Refresh weather", "keywords": ["weather", "refresh"] }
    ]
  },
  "marketplace": {
    "logo": "assets/logo.png",
    "shortDescription": "Live weather in your topbar.",
    "readme": "README.md",
    "screenshots": [
      { "src": "assets/shot-topbar.png", "caption": "Topbar widget", "dark": true }
    ],
    "category": "productivity",
    "keywords": ["weather", "forecast", "topbar"]
  }
}
```

# plugin.json manifest reference

`plugin.json` is the **only** discovery file. It is fully declarative: the shell builds every registry — topbar, desktop, settings, launcher — and the consent and marketplace UI from this file *before any plugin code runs*. Keep it accurate; it is the contract.

## Top-level fields

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `$schema` | string | – | `https://alpine.dev/schemas/plugin-v1.json` for editor autocomplete. |
| `id` | string | ✓ | **Reverse-DNS, lowercase**: dot-separated segments of `a-z 0-9 -`, each starting and ending alphanumeric, with **at least one dot** (e.g. `com.example.weather`). No underscores. Must equal the folder name (case-insensitive). A single bare word like `weather` is rejected — this applies to every plugin, custom or official. |
| `name` | string | ✓ | Display name. |
| `version` | string | ✓ | Strict [semver 2.0.0](https://semver.org). |
| `apiVersion` | integer | ✓ | The contribution-contract version. Must be one the host supports or the plugin is not loaded. |
| `engines.alpineShell` | semver range | – | e.g. `^0.2.0`. The host compat-gates on this against its own version. |
| `description` | string | – | One-line summary. |
| `renderer` | rel path | – | ESM entry module. Omit for a backend-only plugin. Must exist inside the plugin folder. |
| `main` | rel path | – | CJS backend entry. **Ignored unless the plugin is signed** — validated for containment only. |
| `icon` | string | – | `assets/icon.png` (a file in the plugin) or `lucide:CloudSun` (a curated Lucide icon). |
| `contributes` | object | – | The surfaces the plugin adds. See [Contribution surfaces](/docs/contribution-surfaces). |
| `permissions` | string[] | – | Capabilities required at install. Each must be in the permission allowlist. |
| `optionalPermissions` | string[] | – | Capabilities you can grant later. Should not repeat entries already in `permissions` (not currently enforced by the validator). |
| `network.connect` | string[] | – | HTTPS origins the plugin may reach. Becomes the CSP `connect-src`. |
| `author` | object | – | `{ name, url?, email? }`. |
| `homepage` `repository` `license` | string | – | Metadata links. |
| `marketplace` | object | – | Store-listing metadata (below). |

### Rules the validator enforces

- `id` matches the reverse-DNS pattern (dot-separated `a-z 0-9 -` segments, at least one dot, no underscore) **and** equals the normalized folder name (case-insensitive). A single-label id like `weather` fails validation and the plugin won't load.
- Every referenced file (`renderer`, `main`, `icon`, and the `marketplace` assets) exists inside the plugin folder. Symlinks and `..` path escapes are rejected.
- Every permission is in the allowlist (see [Permissions & the security model](/docs/permissions-security)). Unknown tokens are dropped and reported.
- `net:fetch` and `network.connect` are cross-checked: if you request `net:fetch` you must declare at least one `https://` origin, and vice versa.
- An incompatible `apiVersion` or `engines.alpineShell` does not hide the plugin — it still lists, with the reason shown, but won't load.

## The `marketplace` block

Optional presentational metadata used by the store listing and the desktop detail view.

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | Store title. Defaults to `name`. |
| `logo` | `assets/…` | Wordmark or banner, distinct from `icon`. |
| `shortDescription` | string (≤120) | Card subtitle. |
| `readme` | rel path | Long-description markdown, e.g. `"README.md"`. Rendered on the detail page; never executed. |
| `screenshots` | `{ src, caption?, dark? }[]` | Each `src` is an image inside the plugin folder. |
| `category` | enum | One of `productivity`, `system`, `media`, `developer`, `social`, `fun`, `other`. |
| `keywords` | string[] | Search terms. |
| `permissionRationale` | `{ [permission]: string }` | A per-permission human reason, shown in the consent dialog and on the marketplace. Keys must be a subset of your declared permissions. |

## Complete example

```json
{
  "$schema": "https://alpine.dev/schemas/plugin-v1.json",
  "id": "com.example.weather",
  "name": "Weather",
  "version": "0.1.0",
  "apiVersion": 1,
  "engines": { "alpineShell": "^0.2.0" },
  "description": "Current conditions in your topbar.",
  "author": { "name": "Example", "url": "https://example.dev" },
  "homepage": "https://example.dev/weather",
  "repository": "https://github.com/example/alpine-weather",
  "license": "MIT",
  "icon": "lucide:CloudSun",
  "renderer": "dist/renderer.js",
  "contributes": {
    "topbarWidgets": [
      { "export": "TopbarWeather", "slot": "right", "order": 20, "displayScope": "primary" }
    ],
    "settingsPages": [
      { "export": "WeatherSettings", "label": "Weather", "icon": "lucide:CloudSun", "topLevel": true }
    ],
    "launcherCommands": [
      { "kind": "action", "export": "refreshCommand", "title": "Refresh weather", "keywords": ["weather", "refresh"] }
    ]
  },
  "permissions": ["storage", "location:coarse", "net:fetch"],
  "network": { "connect": ["https://api.open-meteo.com"] },
  "marketplace": {
    "logo": "assets/logo.png",
    "shortDescription": "Live weather in your topbar.",
    "readme": "README.md",
    "screenshots": [
      { "src": "assets/shot-topbar.png", "caption": "Topbar widget", "dark": true }
    ],
    "category": "productivity",
    "keywords": ["weather", "forecast", "topbar"],
    "permissionRationale": {
      "location:coarse": "To pick your city automatically.",
      "net:fetch": "To fetch forecasts from Open-Meteo.",
      "storage": "To remember your chosen city."
    }
  }
}
```

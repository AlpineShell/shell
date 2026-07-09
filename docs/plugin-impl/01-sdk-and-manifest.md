# 01 — SDK + Declarative Manifest (DEV-59, DEV-60)

> Subsystem owner doc. Concrete, file-by-file implementation design for `packages/plugin-sdk` (the single
> source of contract constants/types + author hooks) and the declarative `plugin.json` v1 schema + its
> manifest parser/validator in `electron/modules/plugins.js`.
>
> **Trust model today = curation (Tier A only).** Everything here parses/validates/exposes metadata. It does
> **not** enforce isolation — that is Phase 2. Where a decision must stay gated behind the security phase it is
> called out with **[GATED]**. This subsystem's job is to make the manifest *fully declarative and validated
> without executing plugin code*, and to make the contract constants live in exactly one place.

---

## 0. What exists today (baseline this design replaces)

- `electron/modules/plugins.js` — `readManifest()` reads only `{ name, entry }`; `id === folder name`; `SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/` (NOT reverse-DNS); `resolveInBase()` already does realpath containment. `list()` returns `{ id, name, entry, preset, enabled }`. Capability broker = `registerPluginCapability(channel, getter)` + `plugins/data-get`.
- `src/plugins/pluginRuntime.ts` — publishes `window.alpine` v2 (`h/Fragment/hooks/useDarkText/useTopbarBg/usePluginData/PopupMenu/register`). Plugins do `const {h}=window.alpine` (global read, no import). No SDK exists yet.
- `preload.js` — `window.plugins` bridge (`list/dir/openFolder/reload/setEnabled/getData/onData/onReload`).
- `packages/license` — raw-TS single-file package (`exports: { ".": "./src/index.ts" }`), the constant+pure-fn template.

This design **adds** `packages/plugin-sdk` (dual-built), **extends** the manifest schema + `plugins.js` validator, and **replaces** the `list()` shape with the richer `PluginRecord`. Backwards-compat shim in §4.6 keeps the current v2 runtime + `claude-code-usage` preset loading during migration.

---

## 1. `packages/plugin-sdk` — package layout

Mirrors `packages/license` but **dual-built with tsup** (ESM + CJS + `.d.ts`) so the CommonJS Electron main can `require()` the exact same constants the Vite renderer and third-party authors `import`. This is the DRY fix mandated by RFC §3.6 / §7.1.

```
packages/plugin-sdk/
├── package.json
├── tsup.config.ts
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── constants.ts     # PLUGIN_PERMISSIONS, PLUGIN_ID_PATTERN, versions, satisfiesRange, PERMISSION_META
│   ├── manifest.ts      # PluginManifest + marketplace metadata types
│   ├── contributions.ts # *Contribution types, TopbarSlot, DisplayScope
│   ├── validate.ts      # pure validators shared by host + author tooling (no fs, no electron)
│   ├── index.ts         # barrel: re-exports constants + all types + validate (NO react)
│   ├── host.ts          # getHost() bridge accessor (lazy window.alpine read)
│   ├── react.ts         # re-export react/react-dom hooks bound from host
│   ├── jsxRuntime.ts     # { jsx, jsxs, Fragment } real values from host
│   ├── hooks.ts         # usePluginSetting/usePluginData/useShell/theme hooks + PopupMenu
│   └── vite.ts          # alpinePluginPreset()
└── schema/
    └── plugin-v1.json   # JSON Schema generated from types (CI parity-tested vs constants)
```

**`index.ts` must not import React** — `electron/*.js` requires the CJS `index.cjs`, and pulling React into that graph would break the main process. React-touching code lives only in `./react`, `./jsx-runtime`, `./hooks` (renderer-only entrypoints, ESM-only). The host validator imports from `@alpine/plugin-sdk` (`.`) → resolves `index.cjs` → pure, no React.

### 1.1 `package.json`

```jsonc
{
  "name": "@alpine/plugin-sdk",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".":             { "types": "./dist/index.d.ts",     "import": "./dist/index.js",     "require": "./dist/index.cjs" },
    "./react":       { "types": "./dist/react.d.ts",     "import": "./dist/react.js" },
    "./jsx-runtime": { "types": "./dist/jsxRuntime.d.ts", "import": "./dist/jsxRuntime.js" },
    "./hooks":       { "types": "./dist/hooks.d.ts",      "import": "./dist/hooks.js" },
    "./vite":        { "types": "./dist/vite.d.ts",       "import": "./dist/vite.js" },
    "./schema/plugin-v1.json": "./schema/plugin-v1.json"
  },
  "files": ["dist", "schema"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit",
    "schema:check": "vitest run schema.parity"
  },
  "peerDependencies": { "react": ">=19", "vite": ">=5" },
  "peerDependenciesMeta": { "vite": { "optional": true } },
  "devDependencies": { "tsup": "^8", "vitest": "^3", "vite": "^5" }
}
```

- Root `package.json` `test`/`typecheck` scripts add `--filter @alpine/plugin-sdk`.
- `apps/desktop/package.json` adds `"@alpine/plugin-sdk": "workspace:*"` so `electron/*.js` resolves the symlinked `dist/index.cjs`.
- **Build ordering:** SDK builds before the desktop app. Root `release`/`build` runs `bun --filter @alpine/plugin-sdk build` first (add to the pipeline; the desktop electron `require('@alpine/plugin-sdk')` needs `dist/index.cjs` to exist at package time).

### 1.2 `tsup.config.ts`

```ts
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Pure contract: ESM + CJS + d.ts. Required by electron CJS main.
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    // Renderer-only entrypoints. ESM only; react externalized (host owns the instance).
    entry: {
      react: 'src/react.ts',
      jsxRuntime: 'src/jsxRuntime.ts',
      hooks: 'src/hooks.ts',
      vite: 'src/vite.ts',
    },
    format: ['esm'],
    dts: true,
    external: ['react', 'react-dom', 'react/jsx-runtime', 'vite'],
    sourcemap: true,
  },
])
```

### 1.3 `src/constants.ts` — THE single source of truth

```ts
// The contribution-contract version this SDK build speaks.
export const PLUGIN_API_VERSION = 1 as const

// Host accepts a WINDOW of api versions, never hard-equality (RFC §3.5).
export const SUPPORTED_API_VERSIONS: readonly number[] = [1]

// Reverse-DNS, lowercase (RFC §3.2). Two+ labels required.
export const PLUGIN_ID_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// THE permission allowlist. The JSON-Schema enum is CI-asserted equal to this.
export const PLUGIN_PERMISSIONS = [
  // Auto (no consent)
  'storage', 'clock', 'theme',
  // Read (T1)
  'read:volume', 'read:brightness', 'read:media', 'read:network', 'read:bluetooth',
  'read:battery', 'read:apps', 'read:windows', 'read:system-info',
  'net:fetch', 'location:coarse', 'notifications',
  // Control (T2)
  'control:volume', 'control:brightness', 'control:media', 'control:wallpaper', 'control:windows',
  // Sensitive (T3, JIT-confirm)   [GATED: control:network needs network.connectSafe]
  'control:power', 'control:network', 'control:bluetooth', 'launch:apps',
  // Backend  [GATED: signed publishers only]
  'node',
] as const

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number]

// Grant policy classes — drives the consent UI + JIT-confirm gate.
export type PermissionTier = 'auto' | 'read' | 'control' | 'sensitive' | 'node'

export interface PermissionMeta {
  tier: PermissionTier
  label: string        // plain-language, consent dialog
  description: string   // what it lets the plugin do
  confirm?: boolean     // T3: native confirm every call
  gated?: true          // not yet enforceable / signed-only — hidden/greyed until its phase
}

export const PERMISSION_META: Record<PluginPermission, PermissionMeta> = {
  storage:            { tier: 'auto',    label: 'Store its own settings',   description: 'Save data private to this plugin.' },
  clock:              { tier: 'auto',    label: 'Read the clock',           description: 'Current time and timezone.' },
  theme:              { tier: 'auto',    label: 'Match the shell theme',    description: 'Read light/dark and topbar colors.' },
  'read:volume':      { tier: 'read',    label: 'Read the volume',          description: 'Current system volume and mute.' },
  'read:brightness':  { tier: 'read',    label: 'Read screen brightness',   description: 'Current brightness level.' },
  'read:media':       { tier: 'read',    label: 'Read now-playing',         description: 'Track title/artist/state.' },
  'read:network':     { tier: 'read',    label: 'Read network status',      description: 'Wi-Fi connection and signal.' },
  'read:bluetooth':   { tier: 'read',    label: 'Read Bluetooth status',    description: 'Radio state and paired devices.' },
  'read:battery':     { tier: 'read',    label: 'Read battery status',      description: 'Charge level and charging state.' },
  'read:apps':        { tier: 'read',    label: 'Read installed apps',      description: 'List of installed/running apps.' },
  'read:windows':     { tier: 'read',    label: 'Read open windows',        description: 'Titles of open windows.' },
  'read:system-info': { tier: 'read',    label: 'Read system info',         description: 'OS/hardware summary.' },
  'net:fetch':        { tier: 'read',    label: 'Access the network',       description: 'Fetch from its declared hosts only.' },
  'location:coarse':  { tier: 'read',    label: 'Approximate location',     description: 'City-level location.' },
  notifications:      { tier: 'read',    label: 'Show notifications',       description: 'Post desktop notifications.' },
  'control:volume':     { tier: 'control', label: 'Change the volume',        description: 'Set volume and mute.' },
  'control:brightness': { tier: 'control', label: 'Change brightness',        description: 'Set screen brightness.' },
  'control:media':      { tier: 'control', label: 'Control playback',         description: 'Play/pause/skip media.' },
  'control:wallpaper':  { tier: 'control', label: 'Change the wallpaper',     description: 'Set the desktop wallpaper.' },
  'control:windows':    { tier: 'control', label: 'Manage windows',           description: 'Move/resize/focus windows.' },
  'control:power':      { tier: 'sensitive', label: 'Power actions',   description: 'Shut down, restart, sleep.',  confirm: true },
  'control:network':    { tier: 'sensitive', label: 'Change Wi-Fi',    description: 'Join a Wi-Fi network.', confirm: true, gated: true },
  'control:bluetooth':  { tier: 'sensitive', label: 'Change Bluetooth', description: 'Pair/toggle devices.', confirm: true },
  'launch:apps':        { tier: 'sensitive', label: 'Launch apps',     description: 'Open an installed app.', confirm: true },
  node:                 { tier: 'node',      label: 'Run a background service', description: 'Run its own Node backend.', gated: true },
}

// Integer-set membership: additive versioning, never hard-equality.
export function isSupportedApiVersion(v: number): boolean {
  return SUPPORTED_API_VERSIONS.includes(v)
}

// Minimal semver-range satisfaction for engines.alpineShell (RFC §3.5).
// Supports: exact "1.2.3", "^x.y.z", "~x.y.z", ">=x.y.z", "*"/"" (any).
// Kept dependency-free (mirrors packages/license's constant+pure-fn ethos).
export function satisfiesRange(version: string, range: string): boolean { /* impl below */ }
```

`satisfiesRange` impl (dependency-free; the only comparator the host needs, deliberately small — full node-semver is not a dependency of the CJS main):

```ts
function parse(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
export function satisfiesRange(version: string, range: string): boolean {
  const v = parse(version); if (!v) return false
  const r = (range || '').trim()
  if (r === '' || r === '*') return true
  const cmp = (a: number[], b: number[]) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]
  if (r.startsWith('^')) { const b = parse(r.slice(1)); if (!b) return false
    return cmp(v,b) >= 0 && (b[0] > 0 ? v[0]===b[0] : b[1] > 0 ? v[0]===0 && v[1]===b[1] : v[0]===0 && v[1]===0 && v[2]===b[2]) }
  if (r.startsWith('~')) { const b = parse(r.slice(1)); if (!b) return false
    return cmp(v,b) >= 0 && v[0]===b[0] && v[1]===b[1] }
  if (r.startsWith('>=')) { const b = parse(r.slice(2)); return b ? cmp(v,b) >= 0 : false }
  if (r.startsWith('<=')) { const b = parse(r.slice(2)); return b ? cmp(v,b) <= 0 : false }
  if (r.startsWith('>'))  { const b = parse(r.slice(1)); return b ? cmp(v,b) >  0 : false }
  if (r.startsWith('<'))  { const b = parse(r.slice(1)); return b ? cmp(v,b) <  0 : false }
  const b = parse(r); return b ? cmp(v,b) === 0 : false
}
```

### 1.4 `src/contributions.ts`

```ts
export type TopbarSlot = 'left' | 'center' | 'right'
export type DisplayScope = 'primary' | 'all'

interface BaseContribution { export: string; since?: number }

export interface TopbarWidgetContribution extends BaseContribution {
  slot: TopbarSlot
  order?: number
  displayScope?: DisplayScope   // default 'all'
}
export interface DesktopWidgetContribution extends BaseContribution {
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  displayScope?: DisplayScope
}
export interface SettingsPageContribution extends BaseContribution {
  label: string
  icon?: string
  path?: string        // host namespaces to plugin/<id>/<path>
  topLevel?: boolean
}
export interface LauncherCommandContribution extends BaseContribution {
  kind: 'action' | 'provider'
  title?: string
  keywords?: string[]
}
export interface BackendModuleContribution extends BaseContribution {}   // export only; SIGNED-only [GATED]

export interface PluginContributions {
  topbarWidgets?: TopbarWidgetContribution[]
  desktopWidgets?: DesktopWidgetContribution[]
  settingsPages?: SettingsPageContribution[]
  launcherCommands?: LauncherCommandContribution[]
  backendModules?: BackendModuleContribution[]
}
```

### 1.5 `src/manifest.ts` — manifest + marketplace metadata types

```ts
import type { PluginPermission } from './constants'
import type { PluginContributions } from './contributions'

export interface PluginAuthor { name: string; url?: string; email?: string }

// Human-readable justification shown per permission in the consent dialog.
export type PermissionRationale = Partial<Record<PluginPermission, string>>

export interface PluginScreenshot { src: string; caption?: string; dark?: boolean }

// Marketplace / store-listing metadata. Renderer + web both consume this.
export interface PluginMarketplaceMeta {
  displayName?: string          // store title, defaults to manifest.name
  logo?: string                 // "assets/logo.png" — wordmark/banner, distinct from `icon`
  shortDescription?: string     // <= 120 chars, card subtitle
  readme?: string               // rel path to long-description markdown, e.g. "README.md"
  screenshots?: PluginScreenshot[]
  category?: string             // one of MARKETPLACE_CATEGORIES
  keywords?: string[]
  permissionRationale?: PermissionRationale
}

export interface PluginManifest {
  $schema?: string
  id: string
  name: string
  version: string               // strict semver 2.0.0
  apiVersion: number
  engines?: { alpineShell?: string }
  description?: string
  author?: PluginAuthor
  homepage?: string
  repository?: string
  license?: string
  icon?: string                 // "assets/…" | "lucide:CloudSun"
  renderer?: string             // rel path, ESM. Omit if backend-only.
  main?: string                 // rel path, CJS. Ignored unless signed [GATED]
  contributes?: PluginContributions
  permissions?: PluginPermission[]
  optionalPermissions?: PluginPermission[]
  network?: { connect?: string[] }
  marketplace?: PluginMarketplaceMeta
}

export const MARKETPLACE_CATEGORIES = [
  'productivity', 'system', 'media', 'developer', 'social', 'fun', 'other',
] as const
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]
```

### 1.6 `src/validate.ts` — pure validators shared by host + tooling

No `fs`, no `electron` — path *existence*/realpath confinement is the host's job (§4). These are the format/consistency checks reusable in the CLI/`create-alpine-plugin` and unit tests.

```ts
import { PLUGIN_ID_PATTERN, PLUGIN_PERMISSIONS, isSupportedApiVersion, type PluginPermission } from './constants'

export interface ValidationIssue { path: string; message: string }
export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

export function isValidId(id: unknown): id is string
export function isSemver(v: unknown): v is string             // strict 2.0.0 regex
export function isPermission(p: unknown): p is PluginPermission
export function isHttpsOrigin(s: unknown): boolean            // scheme+host[+port], no path, no cleartext, no bare '*', '*.host' ok
export function normalizeRelPath(p: string): string | null   // reject absolute, '', trailing sep, '..' segments (lexical pre-check)
export function validateManifestShape(raw: unknown): ValidationResult   // structural only, no fs
```

`SEMVER_PATTERN` (exported): the official semver 2.0.0 regex. `isHttpsOrigin` rejects `http:`, paths, bare `*`, allows `https://*.example.com`.

### 1.7 `src/host.ts`, `react.ts`, `jsxRuntime.ts`, `hooks.ts` (author-facing, renderer-only)

```ts
// host.ts — lazy accessor; NEVER destructure at module top (StrictMode / hot-reload races, RFC §5.2)
export interface AlpineHost {
  jsxRuntime: { jsx: any; jsxs: any; Fragment: any }
  react: typeof import('react')
  reactDom: typeof import('react-dom')
  useDarkText(): boolean
  useTopbarBg(): string
  useTopbarTheme(): { dark: boolean; bg: string }
  getSetting<T>(key: string, def: T): Promise<T>
  setSetting<T>(key: string, val: T): Promise<void>
  subscribeSetting<T>(key: string, cb: (v: T) => void): () => void
  getData<T>(channel: string, initial: T): T          // wraps window.plugins.getData/onData
  shell: Record<string, (...a: any[]) => Promise<any>> // capability-scoped; only granted methods [GATED enforcement Phase 2]
  PopupMenu: any
}
export function getHost(): AlpineHost { /* return window.alpine (Tier A) or window.alpinePlugin.host (Tier B) */ }
```

```ts
// jsxRuntime.ts — real values by identity (Fragment MUST be the real symbol; RFC §5.2)
const rt = getHost().jsxRuntime
export const { jsx, jsxs, Fragment } = rt
```

```ts
// react.ts — bind real host react hooks (one instance; externalized in the build)
const R = getHost().react
export const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createElement } = R
export const Fragment = R.Fragment
```

```ts
// hooks.ts — the author surface (RFC §7.2). Each reads getHost() lazily inside the call.
export function usePluginSetting<T>(key: string, def: T): [T, (v: T) => void] { /* optimistic, mirrors useVolume */ }
export function usePluginData<T>(channel: string, initial: T): T             // host data-capability channel (existing window.plugins.getData/onData)
export function usePluginBackendState<T>(channel: string, initial: T): T     // [GATED backend]
export function useShell(): AlpineHost['shell']                              // [GATED capability broker Phase 2]
export const useDarkText  = () => getHost().useDarkText()
export const useTopbarBg  = () => getHost().useTopbarBg()
export const useTopbarTheme = () => getHost().useTopbarTheme()
export const PopupMenu: any = (props: any) => getHost().react.createElement(getHost().PopupMenu, props)
```

### 1.8 `src/vite.ts` — `alpinePluginPreset()`

```ts
export interface AlpinePluginPresetOptions { entry: string; outDir?: string }
export function alpinePluginPreset(opts: AlpinePluginPresetOptions): import('vite').UserConfig {
  return {
    esbuild: { jsx: 'automatic', jsxImportSource: '@alpine/plugin-sdk' },
    build: {
      outDir: opts.outDir ?? 'dist',
      lib: { entry: opts.entry, formats: ['es'], fileName: () => 'renderer.js' },
      rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime',
        '@alpine/plugin-sdk', '@alpine/plugin-sdk/react', '@alpine/plugin-sdk/jsx-runtime', '@alpine/plugin-sdk/hooks'] },
      cssCodeSplit: false,   // emit a single renderer.css
      target: 'es2022',
    },
  }
}
```

Externalizing `@alpine/plugin-sdk/*` + react means the emitted `renderer.js` resolves them at runtime through the host import-map (RFC §5.2) — one React instance, full named-export coverage.

---

## 2. `plugin.json` v1 — full schema

Discovery file (the ONLY one). Fully declarative: the host builds every registry + the consent/marketplace UI from this **before any plugin code runs**. `schema/plugin-v1.json` is generated from §1.5 types and CI-asserted (the `permissions`/`optionalPermissions` `enum` must equal `PLUGIN_PERMISSIONS`; `category` enum equals `MARKETPLACE_CATEGORIES`).

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `$schema` | string | – | `https://alpine.dev/schemas/plugin-v1.json` (editor autocomplete). |
| `id` | string | ✓ | `PLUGIN_ID_PATTERN` (reverse-DNS, lowercase). Must equal normalized folder name. |
| `name` | string | ✓ | Display name. |
| `version` | string | ✓ | Strict semver 2.0.0. |
| `apiVersion` | integer | ✓ | ∈ `SUPPORTED_API_VERSIONS` else not loaded. |
| `engines.alpineShell` | semver range | – | `satisfiesRange(app.getVersion(), range)`. |
| `description` | string | – | One-liner. |
| `renderer` | rel path | – | ESM entry. Omit if backend-only. Must exist + be realpath-confined. |
| `main` | rel path | – | CJS backend. **Ignored unless signed** [GATED]. Existence+containment still validated. |
| `icon` | `assets/…` \| `lucide:Name` | – | Curated Lucide subset + `Plug` fallback. `assets/` form validated. |
| `contributes` | object | – | §1.4 surfaces. Each names an `export`; optional `since`. |
| `permissions` | `PluginPermission[]` | – | Required-at-install. Each ∈ `PLUGIN_PERMISSIONS`. |
| `optionalPermissions` | `PluginPermission[]` | – | Grantable later. Each ∈ allowlist; disjoint from `permissions`. |
| `network.connect` | string[] | – | https origins → CSP `connect-src`. `net:fetch` ⇔ presence cross-checked. |
| `author` | `{name,url?,email?}` | – | Metadata. |
| `homepage` `repository` `license` | string | – | Metadata. |
| **`marketplace`** | object | – | Store-listing metadata (§2.1). |

### 2.1 `marketplace` block

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | Store title; defaults to `name`. |
| `logo` | `assets/…` | Wordmark/banner (distinct from `icon`). Existence+containment validated. |
| `shortDescription` | string ≤120 | Card subtitle. |
| `readme` | rel path | Long-description markdown, e.g. `"README.md"`. Existence+containment validated; **content not executed**, served lazily by the detail UI. |
| `screenshots` | `{src,caption?,dark?}[]` | Each `src` a containment-validated `assets/` image. |
| `category` | enum | ∈ `MARKETPLACE_CATEGORIES`. |
| `keywords` | string[] | Search terms. |
| `permissionRationale` | `Partial<Record<Permission,string>>` | Per-permission human reason; shown in consent dialog. Keys must be a subset of declared `permissions ∪ optionalPermissions`. |

### 2.2 Complete example (Weather + marketplace)

```jsonc
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
    "topbarWidgets":   [{ "export": "TopbarWeather", "slot": "right", "order": 20, "displayScope": "primary" }],
    "settingsPages":   [{ "export": "WeatherSettings", "label": "Weather", "icon": "lucide:CloudSun", "topLevel": true }],
    "launcherCommands":[{ "kind": "action", "export": "refreshCommand", "title": "Refresh weather", "keywords": ["weather","refresh"] }]
  },
  "permissions": ["storage", "location:coarse", "net:fetch"],
  "network": { "connect": ["https://api.open-meteo.com"] },
  "marketplace": {
    "logo": "assets/logo.png",
    "shortDescription": "Live weather in your topbar.",
    "readme": "README.md",
    "screenshots": [{ "src": "assets/shot-topbar.png", "caption": "Topbar widget", "dark": true }],
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

---

## 3. Manifest parser/validator — new file `electron/pluginManifest.js`

The current inline `readManifest()` in `plugins.js` (name+entry only) is **replaced** by a dedicated, thin validator that requires the SDK constants and never re-declares them. It is pure w.r.t. plugin code — it reads and validates JSON + stats/realpaths referenced files, and **never `require()`s or imports the plugin's renderer/main**.

```js
// electron/pluginManifest.js
const fs = require('fs')
const path = require('path')
const {
  PLUGIN_ID_PATTERN, PLUGIN_PERMISSIONS, SUPPORTED_API_VERSIONS,
  isSupportedApiVersion, satisfiesRange, MARKETPLACE_CATEGORIES,
} = require('@alpine/plugin-sdk')            // <-- CJS build; SAME constants as renderer
const { isHttpsOrigin, isSemver } = require('@alpine/plugin-sdk')

const PERMISSION_SET = new Set(PLUGIN_PERMISSIONS)
const CATEGORY_SET = new Set(MARKETPLACE_CATEGORIES)

// Realpath-confine a rel path to the plugin's realpathed dir; reject symlink/reparse, absolute, '..', missing.
function confinedFile(realBase, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) return null
  if (rel.split(/[\\/]/).includes('..')) return null
  const target = path.resolve(realBase, rel)
  let lst; try { lst = fs.lstatSync(target) } catch { return null }
  if (lst.isSymbolicLink()) return null                 // reject reparse points
  let real; try { real = fs.realpathSync(target) } catch { return null }
  if (real !== realBase && !real.startsWith(realBase + path.sep)) return null
  let st; try { st = fs.statSync(real) } catch { return null }
  if (!st.isFile()) return null                         // dir-valued entry rejected
  return real
}

// Parse + validate WITHOUT executing plugin code. Returns { ok, record, errors[] }.
function parseManifest(pluginDir, folderName, { preset, appVersion } = {}) {
  const errors = []
  const push = (m) => errors.push(m)

  let realBase
  try { realBase = fs.realpathSync(pluginDir) } catch { return fail(['dir unreadable']) }

  let raw
  try { raw = JSON.parse(fs.readFileSync(path.join(realBase, 'plugin.json'), 'utf8')) }
  catch (e) { return fail(['plugin.json parse: ' + e.message]) }

  // --- identity ---
  const id = String(raw.id || '')
  if (!PLUGIN_ID_PATTERN.test(id)) push('id: not reverse-DNS lowercase')
  if (id.toLowerCase() !== String(folderName).toLowerCase()) push('id: must equal folder name')
  if (!isSemver(raw.version)) push('version: not semver 2.0.0')
  if (!Number.isInteger(raw.apiVersion)) push('apiVersion: must be integer')

  // --- compat gates (soft: recorded, not thrown) ---
  const compat = { apiOk: isSupportedApiVersion(raw.apiVersion), engineOk: true, reason: null }
  const range = raw.engines && raw.engines.alpineShell
  if (range && appVersion && !satisfiesRange(appVersion, range)) {
    compat.engineOk = false; compat.reason = `requires Alpine ${range}`
  }
  if (!compat.apiOk) compat.reason = 'requires a newer Alpine'

  // --- entry paths: existence + realpath containment (NOT loaded) ---
  const rendererPath = raw.renderer != null ? confinedFile(realBase, raw.renderer) : null
  if (raw.renderer != null && !rendererPath) push('renderer: missing or escapes plugin dir')
  const mainPath = raw.main != null ? confinedFile(realBase, raw.main) : null
  if (raw.main != null && !mainPath) push('main: missing or escapes plugin dir')

  // --- icon ---
  let icon = null
  if (typeof raw.icon === 'string') {
    if (raw.icon.startsWith('lucide:')) icon = raw.icon
    else { const p = confinedFile(realBase, raw.icon); if (p) icon = raw.icon; else push('icon: missing/escapes') }
  }

  // --- permissions vs SDK allowlist ---
  const permissions = arr(raw.permissions).filter((p) => { const ok = PERMISSION_SET.has(p); if (!ok) push(`permissions: unknown '${p}'`); return ok })
  const optionalPermissions = arr(raw.optionalPermissions).filter((p) => { const ok = PERMISSION_SET.has(p); if (!ok) push(`optionalPermissions: unknown '${p}'`); return ok })

  // --- network.connect https + cross-check net:fetch ---
  const connect = arr(raw.network && raw.network.connect).filter((o) => { const ok = isHttpsOrigin(o); if (!ok) push(`network.connect: invalid origin '${o}'`); return ok })
  const wantsFetch = permissions.includes('net:fetch') || optionalPermissions.includes('net:fetch')
  if (wantsFetch && connect.length === 0) push('net:fetch requires at least one network.connect origin')
  if (!wantsFetch && connect.length > 0) push('network.connect present without net:fetch permission')

  // --- contributions: shape + since gate; export existence is verified at LOAD, not here ---
  const contributes = validateContributions(raw.contributes, raw.apiVersion, push)

  // --- marketplace metadata (all optional; referenced files containment-checked) ---
  const marketplace = validateMarketplace(raw.marketplace, realBase, permissions, optionalPermissions, CATEGORY_SET, push)

  const record = {
    id, name: typeof raw.name === 'string' && raw.name ? raw.name : folderName,
    version: raw.version, apiVersion: raw.apiVersion,
    renderer: raw.renderer || null, main: raw.main || null, hasBackend: !!raw.main,
    icon, description: raw.description || null,
    author: raw.author || null, homepage: raw.homepage || null, repository: raw.repository || null, license: raw.license || null,
    engines: raw.engines || null,
    contributes, permissions, optionalPermissions, network: { connect },
    marketplace,
    preset: !!preset,
    // trust/compat surface
    compat, verified: false,          // [GATED] signing sets this Phase 3
    enabled: undefined,               // filled by plugins.js from pluginState
    valid: errors.length === 0, errors,
  }
  return { ok: errors.length === 0, record }
}

module.exports = { parseManifest }
```

Helpers `arr`, `fail`, `validateContributions` (checks each contribution has a string `export`, valid `slot`/`kind`, and drops any whose `since > PLUGIN_API_VERSION` — additive-growth safety), and `validateMarketplace` (validates `category ∈ CATEGORY_SET`, `shortDescription ≤ 120`, containment-checks `logo`/`readme`/each `screenshots[].src`, and asserts `permissionRationale` keys ⊆ declared permissions) live in the same file. **`main` is validated for containment but the record carries `hasBackend` so the loader can ignore it until signing lands [GATED].**

**Key invariants enforced here (all without executing plugin code):**
1. `id` reverse-DNS + equals normalized folder name.
2. Every referenced path (`renderer`, `main`, `icon`, `marketplace.logo/readme/screenshots[]`) realpath-confined, symlink-rejected, existence-checked.
3. Permissions ⊆ SDK allowlist (single source).
4. `net:fetch` ⇔ `network.connect` presence, origins are https.
5. Compat gates recorded (soft) — invalid plugins still surface in the UI with a reason.

---

## 4. Edits to `electron/modules/plugins.js`

### 4.1 Widen `SAFE_ID` role + reuse

Keep `SAFE_ID` (`/^[a-z0-9][a-z0-9._-]*$/`) as the **folder-name sanity gate** for scanning/protocol (reverse-DNS ids match it). The stricter reverse-DNS `PLUGIN_ID_PATTERN` check moves into `parseManifest`. Add `MANIFEST_FILE` stays `plugin.json`.

### 4.2 Replace `readManifest` with the validator

```js
const { parseManifest } = require('../pluginManifest')
const { app } = require('electron')

function readManifest(baseDir, folder, preset) {
  const { record } = parseManifest(path.join(baseDir, folder), folder, { preset, appVersion: app.getVersion() })
  if (record.errors.length) console.error(`[plugins] "${folder}" manifest issues:`, record.errors.join('; '))
  return record   // returns even when invalid, so the Plugins page can show the reason
}
```

`scanDir` change: keep the `SAFE_ID` folder gate, but **push the record even when `record.valid === false`** (so invalid/incompatible plugins surface with a reason instead of vanishing). Loader must skip non-loadable ones (see §4.4).

### 4.3 New `list()` / `PluginRecord` shape returned to the renderer

This is the shared contract the settings hub + marketplace UI + loader all read. `list()` merges preset + user dirs (user overrides preset by id) and stamps `enabled` from `pluginState.json`:

```ts
// exported contract (mirror in apps/desktop/src/types/shell.d.ts as PluginRecord)
interface PluginRecord {
  id: string
  name: string
  version: string
  apiVersion: number
  renderer: string | null
  main: string | null
  hasBackend: boolean
  icon: string | null              // 'lucide:X' | 'assets/…'
  description: string | null
  author: { name: string; url?: string; email?: string } | null
  homepage: string | null
  repository: string | null
  license: string | null
  engines: { alpineShell?: string } | null
  contributes: PluginContributions
  permissions: PluginPermission[]
  optionalPermissions: PluginPermission[]
  network: { connect: string[] }
  marketplace: {
    displayName?: string; logo?: string; shortDescription?: string; readme?: string
    screenshots?: { src: string; caption?: string; dark?: boolean }[]
    category?: string; keywords?: string[]
    permissionRationale?: Record<string, string>
  } | null
  preset: boolean
  verified: boolean                // [GATED] false until signing (Phase 3)
  compat: { apiOk: boolean; engineOk: boolean; reason: string | null }
  valid: boolean
  errors: string[]
  enabled: boolean                 // from pluginState.json (default true, disabled set)
  loadable: boolean                // valid && compat.apiOk && compat.engineOk (renderer convenience)
}
```

`list()` computes `loadable = record.valid && record.compat.apiOk && record.compat.engineOk` and `enabled = !disabled.has(id)`.

### 4.4 Loader gating (renderer `loadPlugins.ts`)

`src/plugins/loadPlugins.ts` currently loads by `plugin.entry`. Update to read the new shape:
- skip when `enabled === false` **or** `loadable === false`.
- the import URL uses `plugin.renderer` (fallback to legacy `entry` during migration, see §4.6): `alpine-plugin://<id>/<renderer>?v=<version>`.
- backend `main` is **never** imported in the renderer; the (future) supervisor handles it, and only when `verified` [GATED].

### 4.5 New read-only marketplace/metadata handlers

Add to `plugins.js` `handlers` (all read-only; safe to expose now):

```js
'plugins/manifest': (_e, id) => listPlugins().find((p) => p.id === id) || null,
'plugins/readme':   (_e, id) => readPluginText(id, 'marketplace.readme'),   // realpath-confined read of the README markdown
```

`readPluginText(id, ref)` resolves the record, then `resolvePluginFile(id, record.marketplace.readme)` (existing containment helper) and returns the file text or `null`. This lets the settings/marketplace detail UI show the long description without shipping README into every `list()` payload.

### 4.6 Backwards-compat during migration

The shipped `claude-code-usage` preset uses `{ name, entry }` and the v2 `window.alpine` global. To avoid breaking it before the SDK renderer lands:
- `parseManifest` treats a manifest **lacking `id`** as legacy: `id = folderName`, `renderer = raw.entry || 'index.js'`, `apiVersion` defaults to `1`, `valid = true`, `compat.apiOk = true`, empty permissions/contributes/marketplace. A `legacy: true` flag is set on the record.
- `loadPlugins.ts` keeps `plugin.renderer || plugin.entry` fallback.
- The v2 runtime (`window.alpine` with `register()`) stays until the SDK/import-map path (RFC §5.2, separate subsystem) replaces it. This subsystem does **not** remove it.

---

## 5. main.js / preload / protocol touch points (this subsystem's slice)

- **`main.js`** — no protocol change needed for manifest work (`alpine-plugin://` already realpath-confined via `resolvePluginFile`). The scheme already registered **without `bypassCSP`** for plugin (line 10) — correct. `ipc.register(...)` already includes `plugins`; no new module registration (new handlers are added to the existing `plugins` module).
- **`preload.js` `window.plugins`** — add three bridge methods mirroring the new handlers:
  ```js
  manifest: (id) => ipcRenderer.invoke('plugins/manifest', id),
  readme:   (id) => ipcRenderer.invoke('plugins/readme', id),
  // (list already exists; its return type widens to PluginRecord)
  ```
- **`src/types/shell.d.ts`** — replace `PluginListItem` with `PluginRecord` (§4.3), referencing SDK types via `import type { PluginPermission, PluginContributions } from '@alpine/plugin-sdk'`. Update `window.plugins.list()` return type and add `manifest`/`readme`.
- **`pluginsPage.tsx`** — consumes the richer record: show `version`, `category` badge, `compat.reason` when `!loadable`, `verified`/`Unverified` chip [GATED], and permission chips from `permissions`. (UI detail owned by the settings subsystem; this doc only guarantees the data shape.)

---

## 6. Tests / CI parity (the anti-drift guarantee)

1. **Schema↔constants parity** (`schema.parity.test`): the `enum` for `permissions`/`optionalPermissions` in `schema/plugin-v1.json` deep-equals `PLUGIN_PERMISSIONS`; `category` enum equals `MARKETPLACE_CATEGORIES`. Fails CI on drift (RFC §3.6).
2. **CJS resolution** (`sdk.cjs.test`): `require('@alpine/plugin-sdk')` returns `PLUGIN_PERMISSIONS`, `PLUGIN_ID_PATTERN`, `satisfiesRange`, `SUPPORTED_API_VERSIONS` (proves the dual build + build ordering).
3. **`satisfiesRange`** unit table (`^`, `~`, `>=`, exact, `*`, `0.x` caret edge cases).
4. **`parseManifest`** fixtures: valid weather; junction/symlink `renderer` → rejected; `..` path → rejected; unknown permission → dropped+error; `net:fetch` without `connect` → error; `connect` without `net:fetch` → error; `http://` origin → rejected; `id !== folder` → error; incompatible `apiVersion` → `loadable:false` but still listed; legacy `{name,entry}` → `legacy:true, valid:true`.
5. **`isHttpsOrigin`**: rejects path/cleartext/bare `*`, accepts `*.host`.

---

## 7. What stays GATED (do not ship enforcement in this subsystem)

- `main` backend execution — validated for containment, surfaced as `hasBackend`, but **never forked** until signing (Phase 3) + supervisor (Phase 1 backend). `node` permission is greyed in consent.
- `control:network` — permission exists in the allowlist and validates, but is **unreachable** until `network.connectSafe` lands (Phase 2). Marked `gated` in `PERMISSION_META`.
- Capability broker / `useShell()` real enforcement — the SDK exposes the surface; server-side identity + audited adapters are Phase 2. Until then `useShell()` resolves to the existing read-only data-capability bridge only.
- `verified` is always `false` until Ed25519 signing (Phase 3); the loader must treat unverified plugins as Tier B when isolation exists.

---

## Appendix A — SDK public constant/type export list (for other subsystems)

From `@alpine/plugin-sdk` (`.`, CJS+ESM+d.ts):
- **Constants:** `PLUGIN_API_VERSION`, `SUPPORTED_API_VERSIONS`, `PLUGIN_ID_PATTERN`, `PLUGIN_PERMISSIONS`, `PERMISSION_META`, `MARKETPLACE_CATEGORIES`.
- **Functions:** `satisfiesRange`, `isSupportedApiVersion`, and validators `isValidId`, `isSemver`, `isPermission`, `isHttpsOrigin`, `normalizeRelPath`, `validateManifestShape`.
- **Types:** `PluginManifest`, `PluginMarketplaceMeta`, `PluginScreenshot`, `PluginAuthor`, `PermissionRationale`, `PluginPermission`, `PermissionTier`, `PermissionMeta`, `MarketplaceCategory`, `PluginContributions`, `TopbarWidgetContribution`, `DesktopWidgetContribution`, `SettingsPageContribution`, `LauncherCommandContribution`, `BackendModuleContribution`, `TopbarSlot`, `DisplayScope`.

From `@alpine/plugin-sdk/react`, `/jsx-runtime`, `/hooks`, `/vite` (ESM, renderer-only): `useState…createElement`, `Fragment`, `jsx/jsxs/Fragment`, `usePluginSetting`, `usePluginData`, `usePluginBackendState`, `useShell`, `useDarkText`, `useTopbarBg`, `useTopbarTheme`, `PopupMenu`, `alpinePluginPreset`.

## Appendix B — IPC route table added/changed (for the IPC/preload subsystem)

| Channel | Dir | Shape | Notes |
|---|---|---|---|
| `plugins/list` | invoke | `() → PluginRecord[]` | **widened** from `PluginListItem[]`. |
| `plugins/manifest` | invoke | `(id) → PluginRecord \| null` | new, read-only. |
| `plugins/readme` | invoke | `(id) → string \| null` | new, realpath-confined file read. |
| `plugins/data-get` | invoke | `(channel) → any` | unchanged. |
| `plugins/set-enabled` / `dir` / `open-folder` / `reload` | invoke | unchanged | — |

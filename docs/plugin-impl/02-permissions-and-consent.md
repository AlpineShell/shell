# 02 — Capability Broker, Permission Model & Consent/Permissions UI

> **Subsystem:** DEV-60/61 broker portion. Deny-by-default capability route table, permission tiers as data, per-plugin server-side grants keyed by `event.sender.id`, generalization of `plugins/data-get` into `plugins/invoke(action, payload)`, and the Plugins settings page upgrade into an install/consent surface.
>
> **Trust scope of THIS design:** everything here ships **trusted-tier only** (RFC §4.3 Tier A: first-party, dev-link, curated). The broker, grant map, route table, tier data, and consent UI are all buildable and useful today with the current in-process loader. The pieces that must stay **gated / unbuilt** until the Phase 2 sandbox exists are called out inline with **[GATED]**. This subsystem is the *authorization layer*; it does not by itself make untrusted code safe (that needs the out-of-realm sandbox + `pluginPreload.js`, designed in a sibling doc).

---

## 0. What exists TODAY (baseline this builds on)

Grounded in the current shipped slice:

- `electron/modules/plugins.js` — loader with `capabilities` `Map<channel, getter>`, `registerPluginCapability(channel, getter)`, and one handler `plugins/data-get(channel) → getter()` (pull-only, no permission check, no per-plugin identity). `start(broadcast)`, `{ handlers, start }` module shape. `pluginState.json` holds `{ disabled: [] }`.
- `electron/modules/claudeUsage.js` — a **host data-capability provider**: `plugins.registerPluginCapability('claude-usage', () => current)` + pushes via `broadcast('plugins/data', { channel, data })`.
- `electron/preload.js` — `window.plugins` bridge: `getData(channel)`, `onData(channel, cb)` (filters `payload.channel === channel`), `list/dir/openFolder/reload/setEnabled/onReload`.
- `electron/ipc.js` — `register(...modules)`, `broadcast`, `broadcastToTopbars`; module = `{ handlers, start(broadcast, broadcastToTopbars) }`. **No sender scoping** anywhere except `topbar/set-active-region`.
- `electron/main.js:562` — `alpine-plugin://` protocol handler, realpath-confined via `plugins.resolvePluginFile`.
- Renderer runtime `src/plugins/pluginRuntime.ts` exposes `window.alpine` with `usePluginData(channel, initial)` → `window.plugins.getData/onData`.
- Privileged modules today: `volume.js` has internal `getVolume`/`setVolume` (NOT exported), `power.js` has `powerAction(action)` using constant `exec('shutdown /s /t 0')` strings (NO interpolation — safe), `mediaSession.js` has internal `mediaControl(action)` (NOT exported).

**The generalization this doc makes:** `plugins/data-get(channel)` (unauthorized pull) becomes `plugins/invoke(action, payload)` — one validated channel, deny-by-default, grant-checked, adapter-routed. The existing `data-get` capability map is preserved as the `read:*`-tier "data provider" backend of a small number of `*.get` routes, so `claudeUsage.js` and `usePluginData` keep working unchanged.

---

## 1. Shared contract — the single source of truth

All of the following are **data**, declared once, imported by both the CJS main process and (via the dual-built SDK, RFC §3.6) the renderer + third-party authors. Until `packages/plugin-sdk` exists, they live in a new CJS module `electron/pluginPermissions.js` and are re-exported from the SDK later; the SDK is the eventual home but the *shape* is fixed here.

### 1.1 `PERMISSION_TIERS` — the tier table as data

New file `electron/pluginPermissions.js` (CJS, no build step, `require`-able from main today):

```js
// electron/pluginPermissions.js
// Tier ranks — lower = safer. Drives grant policy + risk badge.
const TIER = {
  AUTO:      { rank: 0, badge: 'auto',      label: 'Automatic',  consent: 'none',    jitConfirm: false },
  READ:      { rank: 1, badge: 'read',      label: 'Read',       consent: 'install', jitConfirm: false },
  CONTROL:   { rank: 2, badge: 'control',   label: 'Control',    consent: 'install', jitConfirm: false },
  SENSITIVE: { rank: 3, badge: 'sensitive', label: 'Sensitive',  consent: 'install', jitConfirm: true  },
  NODE:      { rank: 4, badge: 'node',      label: 'Backend',    consent: 'scary',   jitConfirm: false },
  // FORBIDDEN is NOT a tier a token can hold — it is the *absence* of any token/route.
}
```

### 1.2 `PERMISSION_META` — plain-language copy for every token (drives consent UI)

```js
// electron/pluginPermissions.js (cont.)
// key = permission token; tier = TIER.*; label/description = plain language; risk = badge shown in UI.
const PERMISSION_META = {
  // AUTO — granted with no consent line of its own
  'storage':          { tier: 'AUTO', label: 'Save its own settings',        description: 'Store this plugin’s own preferences on your PC. Isolated from other plugins.' },
  'clock':            { tier: 'AUTO', label: 'Read the current time',         description: 'Access the system clock and time zone.' },
  'theme':            { tier: 'AUTO', label: 'Match the topbar theme',        description: 'Read the current light/dark topbar colors so it can blend in.' },

  // READ (T1) — install consent, silent thereafter
  'read:volume':      { tier: 'READ', label: 'See the volume level',         description: 'Read the current system volume and mute state.' },
  'read:brightness':  { tier: 'READ', label: 'See screen brightness',        description: 'Read the current display brightness.' },
  'read:media':       { tier: 'READ', label: 'See what’s playing',           description: 'Read the current media session (title, artist, play state).' },
  'read:network':     { tier: 'READ', label: 'See network status',           description: 'Read Wi-Fi signal and connection state. Cannot see passwords.' },
  'read:bluetooth':   { tier: 'READ', label: 'See Bluetooth status',         description: 'Read paired devices and radio state.' },
  'read:battery':     { tier: 'READ', label: 'See battery status',           description: 'Read charge level and charging state.' },
  'read:apps':        { tier: 'READ', label: 'See installed apps',           description: 'List installed and running applications. Cannot launch or remove them.' },
  'read:windows':     { tier: 'READ', label: 'See open windows',             description: 'Read titles of open windows. Cannot close or focus them.' },
  'read:system-info': { tier: 'READ', label: 'See system info',              description: 'Read OS version, machine name, and hardware summary.' },
  'net:fetch':        { tier: 'READ', label: 'Connect to the internet',      description: 'Make network requests — ONLY to the sites listed in this plugin’s allowlist.' },
  'location:coarse':  { tier: 'READ', label: 'Approximate location',         description: 'Read a coarse (city-level) location.' },
  'notifications':    { tier: 'READ', label: 'Show notifications',           description: 'Post desktop notifications.' },

  // CONTROL (T2) — install consent
  'control:volume':     { tier: 'CONTROL', label: 'Change the volume',       description: 'Set the system volume and mute state.' },
  'control:brightness': { tier: 'CONTROL', label: 'Change brightness',       description: 'Set display brightness.' },
  'control:media':      { tier: 'CONTROL', label: 'Control playback',        description: 'Play, pause, and skip media.' },
  'control:wallpaper':  { tier: 'CONTROL', label: 'Change the wallpaper',    description: 'Set the desktop wallpaper.' },
  'control:windows':    { tier: 'CONTROL', label: 'Move and resize windows', description: 'Reposition open windows. Cannot close them.' },

  // SENSITIVE (T3) — install consent + native confirm EVERY call
  'control:power':     { tier: 'SENSITIVE', label: 'Shut down / restart',    description: 'Trigger shutdown, restart, or log off. Asks you every time.' },
  'control:network':   { tier: 'SENSITIVE', label: 'Join Wi-Fi networks',    description: 'Connect to a Wi-Fi network. Asks you every time.', gated: true },
  'control:bluetooth': { tier: 'SENSITIVE', label: 'Manage Bluetooth',       description: 'Connect, disconnect, or unpair devices. Asks you every time.' },
  'launch:apps':       { tier: 'SENSITIVE', label: 'Launch applications',    description: 'Start a named installed app. Asks you every time. Cannot run elevated.' },

  // NODE — scary consent, [GATED] signed publishers only
  'node':             { tier: 'NODE', label: 'Run background code',          description: 'Run its own Node.js backend process. Highest risk. Signed publishers only.', gated: true },
}
```

`gated: true` marks a token whose **route is intentionally absent from `capabilityRoutes` until its safe backend lands** (`control:network` needs `network.connectSafe`; `node` needs the signed backend supervisor). The consent UI renders these but the manifest validator **rejects** a manifest requesting a gated token in trusted-tier builds (see §5.4).

### 1.3 `FORBIDDEN_CAPABILITIES` — documentation-only denylist

Not enforced by a check (enforcement = *absence* of a route), but exported so the consent UI and the SDK typings can state "no plugin can ever do this" and so a CI test asserts none of these strings ever appears as a `capabilityRoutes` key:

```js
const FORBIDDEN_CAPABILITIES = [
  'run.exec', 'run.execTerminal',        // arbitrary command execution
  'apps.launchAdmin',                     // elevation
  'setup.setShell', 'setup.revertShell', 'setup.uninstall', 'setup.relaunch', 'setup.restartWindows',
  'updates.install', 'windowsUpdate.install',
  'apps.setStartup',                      // persistence
  'apps.uninstall',                       // uninstall other software
  'apps.endTask', 'launcher.closeWindow', // kill arbitrary process/window
  'tray.click',                           // tray impersonation
  'fs.read', 'fs.write',                  // arbitrary file access
]
```

### 1.4 Exported surface of `electron/pluginPermissions.js`

```js
module.exports = {
  TIER,
  PERMISSION_META,
  FORBIDDEN_CAPABILITIES,
  ALL_PERMISSIONS: Object.keys(PERMISSION_META),   // the allowlist Set source
  tierOf,           // (permission) => TIER key string | null
  metaFor,          // (permission) => PERMISSION_META[permission] | null
  isGated,          // (permission) => boolean
  isKnownPermission,// (permission) => boolean  (∈ ALL_PERMISSIONS)
}
```

`ALL_PERMISSIONS` is the single allowlist the manifest validator checks against (RFC §3.6 "token in union but not the Set is rejected"). A CI parity test asserts `ALL_PERMISSIONS` equals the SDK `PLUGIN_PERMISSIONS` union and the JSON-Schema enum.

---

## 2. The capability route table — `electron/pluginBridge.js` (NEW)

Deny-by-default. **A route is the ONLY way to reach a privileged host function. Absence of a route = permanently unreachable.** Every route is a thin, separately-audited adapter that (a) validates/normalizes the payload with a named validator and (b) calls a **named pure host function** — never a shell string built from plugin input, never a passthrough into another module's `handlers` map by string key, never assuming `event.sender` is a `BrowserWindow`.

### 2.1 The `route()` factory + shape

```js
// electron/pluginBridge.js
// route(permission, run, opts?) => { permission, validate, run, confirm?, describe? }
//   permission : token string that must be in the caller's grant set (checked in pluginHost)
//   validate   : (payload) => normalizedPayload   THROWS on bad input  (default: identity)
//   run        : async (grant, normalizedPayload) => data   calls a named pure host fn
//   confirm    : boolean  — SENSITIVE tier, native JIT confirm before run (§4)
//   describe   : (payload) => { title, detail }   concrete effect string for the confirm dialog
function route(permission, run, opts = {}) {
  return {
    permission,
    validate: opts.validate || ((p) => p),
    run,
    confirm: !!opts.confirm,
    describe: opts.describe || null,
  }
}
```

### 2.2 `capabilityRoutes` — the table

```js
const volume = require('./modules/volume')
const brightness = require('./modules/brightness')
const mediaSession = require('./modules/mediaSession')
const power = require('./modules/power')
const network = require('./modules/network')
const dataProviders = require('./modules/plugins') // the existing registerPluginCapability map

const capabilityRoutes = {
  // ---- READ (T1) : most route to a pure getter or the existing data-capability map ----
  'data.get':          route('read:system-info', (g, p) => dataProviders.readCapability(assertChannel(p))), // generalizes plugins/data-get; permission chosen per-provider (see §2.4)
  'volume.get':        route('read:volume',     ()      => volume.getVolume()),
  'volume.getMute':    route('read:volume',     ()      => volume.getMute()),
  'brightness.get':    route('read:brightness', ()      => brightness.getBrightness()),
  'media.get':         route('read:media',      ()      => mediaSession.getMediaSession()),
  'network.status':    route('read:network',    ()      => network.getStatusSafe()),

  // ---- CONTROL (T2) : install consent, no per-call confirm ----
  'volume.set':        route('control:volume',     (g, p) => volume.setVolume(clampPercent(p)), { validate: clampPercent }),
  'volume.setMute':    route('control:volume',     (g, p) => volume.setMute(assertBool(p)),     { validate: assertBool }),
  'brightness.set':    route('control:brightness', (g, p) => brightness.setBrightness(clampPercent(p)), { validate: clampPercent }),
  'media.control':     route('control:media',      (g, p) => mediaSession.mediaControl(assertTransport(p)), { validate: assertTransport }),

  // ---- SENSITIVE (T3) : install consent + native confirm EVERY call ----
  'power.action':      route('control:power', (g, p) => power.performAction(assertPowerAction(p)), {
    validate: assertPowerAction, confirm: true,
    describe: (p) => POWER_EFFECT[p],  // { title:'Shut down this PC now?', detail:'…' }
  }),

  // ---- [GATED] : token exists in PERMISSION_META, route deliberately ABSENT until safe fn lands ----
  // 'network.connect': route('control:network', (g,p) => network.connectSafe(validateSsid(p.ssid), p.password),
  //   { validate: assertJoinPayload, confirm: true, describe: (p) => ({ title:`Join Wi-Fi "${p.ssid}"?`, detail:'…' }) }),
  //   ^ stays commented until network.connectSafe (execFile argv, validated SSID) exists → control:network is FORBIDDEN meanwhile.
}
```

### 2.3 Validators — the audited surface (small, pure, throw on bad input)

```js
const TRANSPORT = new Set(['play', 'pause', 'playpause', 'next', 'previous', 'stop'])
const POWER = new Set(['shutdown', 'restart', 'logout'])
function clampPercent(p)     { const n = Number(p); if (!Number.isFinite(n)) throw new Error('bad-number'); return Math.max(0, Math.min(100, Math.round(n))) }
function assertBool(p)       { return !!p }
function assertTransport(p)  { if (!TRANSPORT.has(p)) throw new Error('bad-transport'); return p }
function assertPowerAction(p){ if (!POWER.has(p)) throw new Error('bad-power-action'); return p }
function assertChannel(p)    { if (typeof p !== 'string' || !/^[a-z0-9][a-z0-9:-]*$/.test(p)) throw new Error('bad-channel'); return p }
const POWER_EFFECT = {
  shutdown: { title: 'Shut down this PC now?', detail: 'A plugin is requesting shutdown.' },
  restart:  { title: 'Restart this PC now?',   detail: 'A plugin is requesting restart.' },
  logout:   { title: 'Log off now?',           detail: 'A plugin is requesting log off.' },
}
```

### 2.4 The `data.get` generalization (preserves `claudeUsage` + `usePluginData`)

The existing `plugins.js` `capabilities` map is data-provider registry. Add to `plugins.js`:

```js
// electron/modules/plugins.js  — add a permission tag per provider + a safe reader
function registerPluginCapability(channel, getter, permission = 'read:system-info') {
  capabilities.set(channel, { getter, permission })
}
function readCapability(channel) {
  const entry = capabilities.get(channel)
  return entry ? entry.getter() : null
}
function permissionForCapability(channel) {
  const entry = capabilities.get(channel)
  return entry ? entry.permission : null
}
```

`claudeUsage.js` changes one line: `plugins.registerPluginCapability('claude-usage', () => current, 'read:system-info')`. The `data.get` route in §2.2 resolves the per-provider permission dynamically (see §3.3) rather than hardcoding `read:system-info`, so a future provider tagged `read:media` is grant-checked correctly. The legacy `plugins/data-get` handler stays for one release (unauthenticated, trusted-tier read providers only) then is removed once all renderers move to `invoke`.

### 2.5 Named pure functions the bridge depends on (edits to existing modules)

The bridge **never** fakes a null ipc `event` and never reaches into `module.handlers[...]` by key. Each privileged module must **export a named pure function** that both its ipc handler and the bridge call:

| Module | Add to `module.exports` | Notes |
|---|---|---|
| `volume.js` | `getVolume, setVolume, getMute, setMute` | Functions already exist internally; just add to exports. `setVolume` already clamps. |
| `brightness.js` | `getBrightness, setBrightness` | Mirror volume. |
| `mediaSession.js` | `getMediaSession, mediaControl` | Both exist internally; export them. (Note: bridge calls the *bare* `mediaControl`, not the handler wrapper that does the poll-until-different side effect — that side effect is host UX, safe to include or omit.) |
| `power.js` | `performAction(action)` (rename/alias of `powerAction`) | Existing `powerAction` uses constant `exec` strings — **already argv-safe**, no interpolation. Wrap as `performAction` and validate `action` at the route (`assertPowerAction`) as defense-in-depth. |
| `network.js` | `getStatusSafe()`, **`connectSafe(ssid, password)` [GATED]** | `getStatusSafe` returns a redacted read-only status. `connectSafe` is the rewrite of `wifiConnect` to `execFile` argv + validated-SSID profile — **until it exists, `control:network` has no route and is FORBIDDEN.** |

---

## 3. The broker handler — `electron/pluginHost.js` (NEW)

Owns the grant map and the single `plugins/invoke` channel. This is the server-side authorization gate.

### 3.1 Grant map — keyed by `event.sender.id`, never by anything the renderer sends

```js
// electron/pluginHost.js
const { ipcMain } = require('electron')
const { capabilityRoutes } = require('./pluginBridge')
const { permissionForCapability } = require('./modules/plugins')

// wcId (number) -> { pluginId, permissions: Set<string>, webContents }
const grantsByWebContents = new Map()

function grantPlugin(webContents, pluginId, permissions) {
  grantsByWebContents.set(webContents.id, {
    pluginId,
    permissions: new Set(permissions),
    webContents,
  })
  webContents.once('destroyed', () => grantsByWebContents.delete(webContents.id))
}
function revokePermission(webContents, permission) {           // live revocation
  const g = grantsByWebContents.get(webContents.id)
  if (g) g.permissions.delete(permission)
}
function updateGrant(webContents, permissions) {               // re-consent / update
  const g = grantsByWebContents.get(webContents.id)
  if (g) g.permissions = new Set(permissions)
}
function grantFor(webContents) { return grantsByWebContents.get(webContents.id) || null }
```

**Trusted-tier note:** in the current in-process loader, ALL Tier A plugins share the topbar/settings `webContents`, so a per-`webContents` key cannot separate two co-resident plugins by identity — the renderer's own registry closure supplies the `pluginId` today. The map is therefore keyed by `webContents.id` **and** the grant records the `pluginId`; the *real* per-plugin isolation lands with the Tier B sandbox where each plugin gets its own `webContents` **[GATED]**. Design the map now so the Phase 2 wiring is a no-op; enforce it as a real boundary only once surfaces are per-plugin. This is stated plainly so nobody mistakes the trusted-tier grant map for a security boundary between co-resident trusted plugins.

### 3.2 The `plugins/invoke` handler (generalizes `plugins/data-get`)

```js
ipcMain.handle('plugins/invoke', async (event, message) => {
  const grant = grantFor(event.sender)
  if (!grant) return { ok: false, error: 'not-a-plugin' }
  const action = message && message.action
  const route = capabilityRoutes[action]
  if (!route) return { ok: false, error: 'unknown-action' }

  // resolve the required permission (data.get resolves per-provider, §3.3)
  const required = resolveRequiredPermission(route, message.payload)
  if (!grant.permissions.has(required)) return { ok: false, error: 'denied', permission: required }

  let payload
  try { payload = route.validate(message.payload) }
  catch (e) { return { ok: false, error: 'bad-payload', detail: String(e && e.message || e) } }

  if (route.confirm && !(await confirmEffect(grant, route, payload))) {
    return { ok: false, error: 'user-blocked' }
  }
  try { return { ok: true, data: await route.run(grant, payload) } }
  catch (e) { return { ok: false, error: String((e && e.message) || e) } }
})
```

### 3.3 `resolveRequiredPermission`

```js
function resolveRequiredPermission(route, payload) {
  if (route.permission === 'read:system-info' && route === capabilityRoutes['data.get']) {
    // per-provider: a channel tagged read:media requires read:media
    return permissionForCapability(assertChannelSafe(payload)) || 'read:system-info'
  }
  return route.permission
}
```

### 3.4 Exported surface of `electron/pluginHost.js`

```js
module.exports = {
  handlers: { 'plugins/invoke': /* the handler above, registered via ipc.register */ },
  start(broadcast) { /* store broadcast for target-send events, §6 */ },
  grantPlugin, revokePermission, updateGrant, grantFor,   // called by pluginRegistry on consent
}
```

Registered in `main.js` via `ipc.register(..., pluginHost)` — it is a normal `{ handlers, start }` module. **[GATED]** management channels (`plugins/set-enabled`, future install/uninstall) must be wrapped by a positive `isTrustedSender()` (settings window only) before Tier B ships; trusted-tier today they are open, matching the existing `plugins.js` handlers.

---

## 4. Just-in-time confirm — `confirmEffect` (SENSITIVE tier)

```js
// electron/pluginHost.js
const { dialog } = require('electron')
const rateWindow = new Map()   // pluginId -> [timestamps]   rolling 60s
const blocked = new Map()      // `${pluginId}:${action}` -> true  ("don't ask again")

async function confirmEffect(grant, route, payload) {
  const key = `${grant.pluginId}:${route.permission}`
  if (blocked.get(key)) return false
  if (isRateLimited(grant.pluginId)) return false          // e.g. > 5 confirms / 60s
  const { title, detail } = route.describe ? route.describe(payload) : { title: 'Allow this action?', detail: '' }
  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: 'warning', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1,
    title: 'Alpine Shell', message: title, detail: `${grant.pluginId}\n${detail}`,
    checkboxLabel: 'Block and don’t ask again', checkboxChecked: false,
  })
  if (checkboxChecked) blocked.set(key, true)
  return response === 0
}
```

The dialog renders the **concrete effect + target** (`describe(payload)`), never a raw `action` string, is **rate-limited per plugin** (defeats confirm-spam-into-a-freeze), and offers "block and don't ask again". `blocked` resets on plugin reload/uninstall.

---

## 5. Grants persistence & consent flow

### 5.1 Where grants live (server-side, outside the plugin dir)

Grants are written to `pluginRegistry.json` **under the userData root, outside any `pluginDir`** (RFC §6.6 grant-self-escalation fix — a plugin must not be able to widen its own grant by rewriting a file it can write). Shape:

```jsonc
// %APPDATA%\Alpine Shell\pluginRegistry.json   (atomic tmp+rename, .bak recovery — frecency.js template)
{
  "plugins": {
    "com.example.weather": {
      "enabled": false,                 // installStaged defaults false (RFC §4.9)
      "granted": ["storage", "read:media", "control:media"],   // FROM CONSENT, never blindly from manifest
      "grantedAt": 1731000000000,
      "manifestHash": "sha256-…"        // to detect a changed manifest → re-consent
    }
  }
}
```

For the current release, the simpler `pluginState.json` `{ disabled: [] }` remains; the `granted` set is additive and only consulted by the broker. `pluginRegistry.js` (a Phase-1 file) owns this store; this doc specifies the `granted` field + the `grantPlugin` call.

### 5.2 Consent flow (install / enable)

```
discover manifest → parse+validate (§5.4) → open pluginConsentDialog with { meta, requested[] }
  → user Grant  → write granted[] to pluginRegistry.json
                → grantPlugin(webContents, id, granted)   (broker map)
                → set enabled:true, load surfaces
  → user Cancel → nothing written, plugin stays disabled
```

- `installStaged` defaults `enabled:false`; the granted set is taken **from the consent**, never blindly from `manifest.permissions`.
- **New permissions on update ⇒ re-consent:** updater diffs `granted` vs `manifest.permissions`; if the manifest requests a token not in `granted`, block activation until re-approved. `updateGrant(webContents, newGranted)` applies it live.
- **Per-permission revocation** calls `revokePermission(webContents, permission)` — a running plugin loses access immediately (mutates the live Set).

### 5.3 `alpine-shell://install-plugin` deep link — **NEVER auto-installs** [GATED marketplace]

Only focuses the Settings window on the plugin detail/consent page. A real user click + the consent modal are required. Out of scope for this subsystem beyond noting the contract.

### 5.4 Manifest validation gate (what the consent surface consumes)

Before the dialog opens, the manifest validator (`pluginManifest.js`, Phase 1) must:
1. Reject any `permissions[]` entry `∉ ALL_PERMISSIONS`.
2. **Reject any `isGated(token)` token in trusted-tier builds** (`control:network`, `node`) with a clear "not yet available" reason — they render in docs but cannot be granted until their safe backend + signing land.
3. Cross-check `net:fetch` ⇔ `network.connect` presence.
4. Produce a normalized `requested[]` = manifest permissions expanded to `{ token, meta, rationale }` (see §6.2) that the dialog and the Plugins card both render.

---

## 6. Plugins settings page upgrade — the install/consent surface

Replace the flat toggle list in `src/components/settings/pluginsPage.tsx` with a **per-plugin card** that is simultaneously the installed-state view and the consent surface.

### 6.1 Data the card needs (extend `PluginListItem` → `PluginRecord`)

`plugins/list` (and a new `plugins/detail(id)`) return, per plugin:

```ts
interface PluginRecord {
  id: string
  name: string
  version?: string
  description?: string          // short one-liner (manifest.description)
  longDescription?: string      // markdown body (manifest.longDescription | README-derived)
  icon?: string                 // 'assets/icon.svg' | 'lucide:CloudSun'  → resolved to alpine-plugin:// url or lucide name
  author?: { name?: string; url?: string }
  preset: boolean
  enabled: boolean
  verified?: boolean            // [GATED] signing — always false in trusted-tier; drives an "Unverified" note
  permissions: PermissionView[] // see §6.2
}
interface PermissionView {
  token: string
  label: string                 // PERMISSION_META[token].label
  description: string           // PERMISSION_META[token].description
  tier: string                  // TIER key: 'AUTO' | 'READ' | 'CONTROL' | 'SENSITIVE' | 'NODE'
  badge: string                 // TIER[tier].badge → risk badge color
  rationale?: string            // plugin's OWN per-permission reason, from manifest.permissionRationale[token]
  granted: boolean              // is this token in the plugin's granted set right now
  gated?: boolean               // token exists but route unavailable in this build
}
```

The host builds `PermissionView[]` by joining `manifest.permissions` → `PERMISSION_META` (label/description/tier/badge) → `manifest.permissionRationale[token]` (the plugin's own plain-language "why") → the live `granted` set. **The renderer never trusts a plugin-supplied label/tier — those come from host `PERMISSION_META`.** Only `rationale` is author-supplied free text (rendered as plain text, not markdown, to avoid injection).

### 6.2 Manifest additions consumed here (author-facing)

```jsonc
{
  "description": "Current conditions in your topbar.",
  "longDescription": "## Weather\nShows the temperature…",       // markdown
  "permissionRationale": {
    "net:fetch":   "To fetch the forecast from open-meteo.com.",
    "location:coarse": "To default to your city on first run."
  }
}
```

### 6.3 Card layout

Per-plugin card renders, top to bottom:
- **Header:** logo (icon → `alpine-plugin://<id>/assets/icon.svg` or a Lucide glyph, `Plug` fallback), name, version, author, Preset/Unverified badges, enable/disable switch.
- **Short description** (`description`).
- **Long description** — `longDescription` markdown rendered with the app's existing markdown renderer (or a minimal safe renderer; **no raw HTML**, links open externally via the host).
- **Permissions list** — one row per `PermissionView`, grouped/ordered by tier rank (AUTO first, NODE last). Each row:
  - risk **badge** colored by `badge` (auto=neutral, read=blue, control=amber, sensitive=red, node=red-outline),
  - **label** + host **description** (`PERMISSION_META`),
  - the plugin's own **rationale** in muted text (`permissionRationale[token]`),
  - a per-permission toggle wired to `revokePermission`/re-grant (optional revocation; AUTO tokens are non-revocable),
  - a "Not available in this build" tag when `gated`.
- **Consent footer** (install/enable path only): **Grant & Enable** / **Cancel**. Grant writes the granted set + calls `grantPlugin`.

### 6.4 New/changed preload bridge (`window.plugins`)

Add to `electron/preload.js` `window.plugins`:

```js
invoke: (action, payload) => ipcRenderer.invoke('plugins/invoke', { action, payload }),
detail: (id) => ipcRenderer.invoke('plugins/detail', id),
grant:  (id, permissions) => ipcRenderer.invoke('plugins/grant', { id, permissions }),   // [GATED] isTrustedSender
setPermission: (id, permission, enabled) => ipcRenderer.invoke('plugins/set-permission', { id, permission, enabled }),
```

`plugins/grant` / `plugins/set-permission` are new handlers on `pluginHost.js` (write `granted[]`, update the live grant map). `getData/onData` stay for back-compat; new code uses `invoke('data.get', channel)` and the target-sent event stream (§6.5).

### 6.5 Events — target-send, id-less (server-side identity)

Backend/data pushes to a plugin must **not** use `ipc.js broadcast()` (hits all windows → cross-plugin eavesdropping). The broker `target-send`s an **id-less** `plugin/<action>` channel *only* to the owning plugin's `webContents` (looked up in the grant map). The preload subscribes to the id-less channel; delivery is scoped by `webContents`, not a guessable channel name. **[GATED]** — only meaningful once surfaces are per-plugin; trusted-tier keeps the existing `plugins/data` broadcast for `usePluginData`, documented as an eavesdropping surface to close in Phase 2.

---

## 7. SDK / renderum runtime surface (`useShell`)

The renderer runtime (`pluginRuntime.ts` / future `@alpine/plugin-sdk`) exposes a **capability-scoped** client whose method set is generated from `capabilityRoutes` keys — only granted methods appear (typed from the enumerated route surface):

```ts
// window.alpine.shell / useShell()
const shell = useShell()
await shell.volume.set(40)        // → invoke('volume.set', 40)
const v = await shell.volume.get()// → invoke('volume.get')
```

Each method is `invoke(action, payload)` under the hood; a `denied`/`unknown-action`/`user-blocked` result rejects with a typed error. The mapping `action string → nested method` is derived from the dotted route key (`volume.set` → `shell.volume.set`). `usePluginData(channel)` is re-expressed as `invoke('data.get', channel)` + the target-send subscription.

---

## 8. What stays GATED (untrusted grant flow — NOT built here)

A real untrusted (Tier B) grant flow adds, on top of everything above:
- **Out-of-realm sandbox** (`WebContentsView`/child window, `sandbox:true`, per-plugin `session.fromPartition('persist:plugin-<id>')`, nav lockdown, all web-permission handlers deny) + `pluginPreload.js` exposing only `window.alpinePlugin` — this is what finally makes the per-`webContents` grant map a **real** per-plugin boundary.
- **Code signing** (Ed25519 vs bundled `MARKETPLACE_PUBLIC_KEY`) verified at install + every load; `verified` flips true; `node`/backend only for verified publishers.
- **`control:network` / `node` routes** un-gated once `network.connectSafe` (execFile argv) and the `utilityProcess` supervisor exist.
- **Data-flow line + publisher-verification banner** in the consent dialog (which `read:*` scopes can leave to which `net:connect` host).
- **`isTrustedSender()` positive registry** gating every management channel (`plugins/grant`, `set-enabled`, install/uninstall) to the settings window only.

Until then: trusted/curated tier only, gated tokens rejected at validation, and the Plugins page carries the existing "Plugins run with full shell access — only add ones you trust" warning.

---

## 9. File-by-file summary

| File | Action | Key exports / edits |
|---|---|---|
| `electron/pluginPermissions.js` | **NEW** | `TIER`, `PERMISSION_META`, `FORBIDDEN_CAPABILITIES`, `ALL_PERMISSIONS`, `tierOf`, `metaFor`, `isGated`, `isKnownPermission` |
| `electron/pluginBridge.js` | **NEW** | `route()`, `capabilityRoutes`, validators (`clampPercent`, `assertTransport`, `assertPowerAction`, `assertBool`, `assertChannel`), `POWER_EFFECT` |
| `electron/pluginHost.js` | **NEW** | `{ handlers:{ 'plugins/invoke','plugins/grant','plugins/set-permission','plugins/detail' }, start }`, `grantPlugin`, `revokePermission`, `updateGrant`, `grantFor`, `confirmEffect` |
| `electron/modules/plugins.js` | **EDIT** | `registerPluginCapability(channel,getter,permission)`, `readCapability`, `permissionForCapability`; keep legacy `plugins/data-get` one release |
| `electron/modules/volume.js` | **EDIT** | export `getVolume, setVolume, getMute, setMute` |
| `electron/modules/brightness.js` | **EDIT** | export `getBrightness, setBrightness` |
| `electron/modules/mediaSession.js` | **EDIT** | export `getMediaSession, mediaControl` |
| `electron/modules/power.js` | **EDIT** | export `performAction` (alias of existing `powerAction`; already argv-safe) |
| `electron/modules/network.js` | **EDIT** | export `getStatusSafe`; **[GATED]** `connectSafe(ssid,password)` (execFile argv) |
| `electron/main.js` | **EDIT** | `ipc.register(..., pluginHost)`; register `pluginHost` after `plugins` |
| `electron/preload.js` | **EDIT** | `window.plugins.invoke/detail/grant/setPermission` |
| `claudeUsage.js` | **EDIT** | one-line: tag `registerPluginCapability('claude-usage', …, 'read:system-info')` |
| `src/components/settings/pluginsPage.tsx` | **REWRITE** | per-plugin card: logo/name/desc, markdown long-desc, `PermissionView[]` rows from `PERMISSION_META` + rationale, consent footer |
| `src/plugins/pluginRuntime.ts` | **EDIT** | add `useShell()` capability-scoped client over `invoke`; keep `usePluginData` |
| `pluginRegistry.json` | **NEW store** | `{ plugins: { <id>: { enabled, granted[], grantedAt, manifestHash } } }` (frecency.js atomic template) |
| CI | **NEW test** | `ALL_PERMISSIONS` == SDK union == JSON-Schema enum; no `capabilityRoutes` key ∈ `FORBIDDEN_CAPABILITIES` |

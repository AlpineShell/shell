# 03 — Marketplace backend + publish pipeline + storage migration (DEV-62)

**Owner subsystem:** publish pipeline, marketplace install module, deep link, R2→Railway storage migration.
**Depends on:** the on-disk plugin layout and loader (`electron/modules/plugins.js`), the atomic-store pattern (`electron/modules/frecency.js`), the `{ handlers, start(broadcast) }` module contract (`electron/ipc.js`), and the `scripts/publish.js` S3 shape.
**Trust tier today:** **Tier A / curation only.** The catalog `index.json` is a single-writer root; only first-party + vetted publishers list. Signing verify is implemented and *enforced at install*, but the untrusted sandbox (Tier B) is a separate, still-gated phase — this doc explicitly marks what stays gated.

This document is self-contained: schemas, route tables, and exported constant names are inlined so other subsystems can wire against them without re-reading it.

---

## 0. Shared contract (other subsystems depend on these — do not rename)

### 0.1 Exported constants

`electron/pluginMarketplaceContract.js` (new, tiny CJS, `require`-able by main + reused by scripts; mirrors "constant baked in + pure verify" from `packages/license`):

```js
module.exports = {
  // Ed25519 public key (base64, 32 bytes raw) baked into the app. Private key never ships.
  MARKETPLACE_PUBLIC_KEY: 'BASE64_ED25519_PUBLIC_KEY_PLACEHOLDER',
  // Public read base URL of the object store, TRAILING SLASH REQUIRED.
  // Migration flips this value; nothing else in the module references a host.
  MARKETPLACE_BASE_URL: 'https://pub-634a0706ca394cf7a0eedfa4f8a71a56.r2.dev/',
  CATALOG_KEY: 'plugins/index.json',
  latestKey: (id) => `plugins/${id}/latest.json`,
  bundleKey: (id, version) => `plugins/${id}/${version}/${id}-${version}.alpineplugin`,
  iconKey: (id) => `plugins/${id}/icon.png`,
  CATALOG_SCHEMA_VERSION: 1,
  PACKAGE_EXT: '.alpineplugin',
}
```

The **same** `MARKETPLACE_PUBLIC_KEY` string is what `scripts/publishPlugin.js` signs against (it holds the private half in env), so publish and verify can never drift.

### 0.2 IPC channel table (all mutating channels gated to the settings window)

| Channel | Direction | Gate | Payload → Return |
|---|---|---|---|
| `marketplace/catalog` | invoke | open (read) | `()` → `Catalog` (cached, may be stale) |
| `marketplace/refresh` | invoke | open (read) | `()` → `Catalog` (force network re-fetch) |
| `marketplace/available` | invoke | open (read) | `()` → `AvailableEntry[]` (catalog ∖ installed, + `hasUpdate`) |
| `marketplace/installed` | invoke | open (read) | `()` → `InstalledEntry[]` |
| `marketplace/install` | invoke | **settings-only** | `{ id, version? }` → `{ ok, id, version, error? }` |
| `marketplace/uninstall` | invoke | **settings-only** | `{ id }` → `{ ok, error? }` |
| `marketplace/state-changed` | broadcast | — | `MarketplaceState` (install progress / errors) |
| `marketplace/focus-detail` | broadcast → settings | — | `{ id, version? }` (fired by the deep link) |

The gate is `isTrustedSender(event)` (settings-window `webContents` registry — see §4). It is the same positive-registry gate the RFC mandates for `plugins/*` management. Read channels may stay open; every channel that writes disk or state is settings-only.

### 0.3 Preload bridge (added to `window.plugins` in `electron/preload.js`)

```js
marketplace: {
  catalog:   () => ipcRenderer.invoke('marketplace/catalog'),
  refresh:   () => ipcRenderer.invoke('marketplace/refresh'),
  available: () => ipcRenderer.invoke('marketplace/available'),
  installed: () => ipcRenderer.invoke('marketplace/installed'),
  install:   (id, version) => ipcRenderer.invoke('marketplace/install', { id, version }),
  uninstall: (id) => ipcRenderer.invoke('marketplace/uninstall', { id }),
  onStateChanged: (cb) => { const h=(_,d)=>cb(d); ipcRenderer.on('marketplace/state-changed',h); return ()=>ipcRenderer.removeListener('marketplace/state-changed',h) },
  onFocusDetail:  (cb) => { const h=(_,d)=>cb(d); ipcRenderer.on('marketplace/focus-detail',h); return ()=>ipcRenderer.removeListener('marketplace/focus-detail',h) },
},
```

---

## 1. Catalog JSON schemas (the wire contract with `apps/web` and the publisher)

Both are plain JSON at fixed object-store keys. `apps/web/src/app/plugins` reads the **same** `index.json`; the desktop marketplace module and the publish script write/read it. Versioned via `schemaVersion` for forward-compat.

### 1.1 `plugins/index.json` — the rolled-up catalog (no-cache)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-08T12:00:00.000Z",
  "plugins": [
    {
      "id": "com.example.weather",          // reverse-DNS lowercase; folder name == id
      "name": "Weather",
      "version": "0.3.1",                    // latest published, strict semver
      "description": "Current conditions in your topbar.",
      "author": "Example",                   // string (display) — object form flattened at publish
      "homepage": "https://example.dev",     // optional
      "license": "MIT",                      // optional
      "apiVersion": 1,                       // manifest.apiVersion of latest
      "engines": { "alpineShell": "^0.2.0" },// optional; marketplace compat-gates on this
      "iconUrl": "plugins/com.example.weather/icon.png", // relative to MARKETPLACE_BASE_URL, optional
      "verified": true,                      // curation flag (first-party / vetted publisher)
      "sha256": "hex64",                     // of the latest .alpineplugin
      "size": 40213,                         // bytes of the latest bundle
      "url": "plugins/com.example.weather/0.3.1/com.example.weather-0.3.1.alpineplugin",
      "signature": "base64",                 // Ed25519 detached sig over the sha256 bytes
      "publishedAt": "2026-07-08T12:00:00.000Z"
    }
  ]
}
```

`url` / `iconUrl` are **relative** keys; the client resolves them against `MARKETPLACE_BASE_URL` with `new URL(key, base)`. This is what makes the storage migration a one-line base-URL flip (§6): no absolute host is baked into any catalog entry.

### 1.2 `plugins/<id>/latest.json` — per-plugin pointer + integrity (no-cache)

```jsonc
{
  "schemaVersion": 1,
  "id": "com.example.weather",
  "version": "0.3.1",
  "sha256": "hex64",
  "signature": "base64",                     // Ed25519 detached over the raw sha256 digest bytes
  "size": 40213,
  "url": "plugins/com.example.weather/0.3.1/com.example.weather-0.3.1.alpineplugin",
  "apiVersion": 1,
  "engines": { "alpineShell": "^0.2.0" },
  "publishedAt": "2026-07-08T12:00:00.000Z"
}
```

`index.json` is the derived roll-up of every `latest.json`. `install` reads the catalog entry (or refreshes `latest.json` for the exact version) and verifies against **these** `sha256`+`signature`, never against anything the renderer supplies.

**Signature domain (must match exactly on both sides):** `signature = Ed25519_sign(privKey, sha256_digest_bytes)`, where `sha256_digest_bytes` is the raw 32-byte SHA-256 of the `.alpineplugin` file. Verify = `crypto.verify(null, sha256DigestBuffer, publicKeyObject, signatureBuffer)`. Signing over the *hash* (not the whole file) keeps the signer cheap and lets the client verify hash-then-signature in two O(1) steps after the O(n) download hash.

---

## 2. `scripts/publishPlugin.js` — the publish pipeline (new file)

CLI: `node scripts/publishPlugin.js <pluginDir>` (run from `apps/desktop`). Reuses the `S3Client` shape and `cacheControlFor` idea from `scripts/publish.js`. **Node-only crypto (`node:crypto`, `node:zlib`)** — no new npm deps for hashing/signing. ZIP creation uses the built-in `tar.exe`/`bsdtar` on Windows CI (same "shell to a system tool" convention as `reg`/`csc`), with an `archiver` fallback documented but not required.

### 2.1 Steps (each a pure function so they unit-test without S3)

```js
// scripts/publishPlugin.js  (CJS, matches publish.js style)
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { readStorageEnv, createStorageClient } = require('./storage')   // §6 shared factory

// 1. Validate the plugin folder: plugin.json present, id matches SAFE_ID + reverse-DNS,
//    version strict semver, id === basename(pluginDir). Reject otherwise (exit 1).
function readAndValidateManifest(pluginDir) { /* returns { id, version, name, ... } */ }

// 2. Pack -> <id>.alpineplugin, ROOT = plugin.json (no wrapping folder), zip-slip-safe.
//    Enumerate files with a walk that REJECTS symlinks (lstat.isSymbolicLink) and
//    entries resolving outside realpath(pluginDir); skip node_modules/.git/*.alpineplugin.
//    Deterministic entry order for reproducible hashes.
function packPlugin(pluginDir, id) { /* returns absolute path to the built .alpineplugin */ }

// 3. sha256 of the built package (streaming).
function sha256File(file) { /* returns { hex, digest: Buffer } */ }

// 4. Ed25519 detached signature over the sha256 DIGEST BYTES.
//    Key from env ALPINE_PLUGIN_SIGNING_KEY (PKCS8 PEM, base64-encoded in the env var).
function signDigest(digestBuffer) {
  const pem = Buffer.from(process.env.ALPINE_PLUGIN_SIGNING_KEY, 'base64').toString('utf8')
  const key = crypto.createPrivateKey(pem)
  return crypto.sign(null, digestBuffer, key).toString('base64')  // Ed25519: algorithm MUST be null
}

// 5. Upload bundle (immutable), icon (if present), then per-plugin latest.json.
//    ContentType: application/zip for bundle, application/json for the two json files.
//    CacheControl: 'public, max-age=31536000, immutable' for the versioned bundle;
//                  'no-cache' for latest.json + index.json (mirrors *.yml handling in publish.js).
async function uploadArtifacts(client, bucket, { id, version, bundlePath, iconPath, latest }) { /* ... */ }

// 6. Roll up the catalog: GET plugins/index.json (tolerate 404 -> empty), upsert THIS plugin's
//    entry (replace any existing entry with same id), sort by name, bump generatedAt, PUT back.
//    Single-writer model: publisher is the trust root; no merge conflicts expected in CI.
async function updateCatalog(client, bucket, entry) { /* GET->mutate->PUT index.json */ }
```

### 2.2 zip-slip / symlink safety (mirrors runtime containment)

- **Pack side:** walk with `fs.lstatSync`; any `isSymbolicLink()` entry aborts the pack. Every path is `path.relative(pluginDir, abs)` and asserted not to start with `..` or be absolute. `plugin.json` MUST be at archive root (`arcname` has no leading folder).
- This is the *producer* half; the *consumer* half (extract-time re-validation) lives in the marketplace module (§3.3) because a hostile bundle can be crafted independent of this script.

### 2.3 What must be provided to run it

- `ALPINE_PLUGIN_SIGNING_KEY` — base64 of a PKCS8 PEM Ed25519 **private** key. Generate once:
  `node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ed25519');console.log('PUB',publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'));console.log('PRIV_B64',Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'))"`
  Paste `PUB` into `MARKETPLACE_PUBLIC_KEY`; store `PRIV_B64` as the GitHub secret / local env.
- Storage env (§6): `STORAGE_*` (with `R2_*` back-compat).

### 2.4 package.json script

```jsonc
"scripts": {
  "publish:plugin": "node scripts/publishPlugin.js"
}
```

Usage: `bun run publish:plugin presets/plugins/claude-code-usage` (or any built plugin dir).

---

## 3. `electron/modules/pluginMarketplace.js` — install module (new file)

Follows the exact `{ handlers, start(broadcast) }` module contract; registered in `main.js`'s `ipc.register(...)` list. Fetches with Electron `net.fetch` (same primitive `electron-updater` uses). Persists the cached catalog with the **frecency atomic tmp+rename** pattern.

### 3.1 Paths (single source; extends `plugins.getPluginsDir()`)

```
<userData>/plugins/                       # existing installed tree (plugins.js owns per-id dirs)
<userData>/plugins/.cache/index.json      # last-fetched catalog (atomic write)
<userData>/plugins/.staging/<id>-<ver>/   # extract target before atomic swap
<userData>/plugins/.trash/<id>-<ts>/      # locked dirs pending delete, cleared on boot
```

Reuses `plugins.getPluginsDir()` so installed plugins land where the loader already scans — **install = drop a folder the existing loader picks up on `plugins/reload`.** No second registry needed for Tier A curation; enabled/disabled still flows through the existing `pluginState.json`.

### 3.2 Module shape

```js
const { app, net } = require('electron')
const path = require('node:path'); const fs = require('node:fs'); const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const plugins = require('./plugins')
const C = require('../pluginMarketplaceContract')

let broadcast = null
let catalog = null          // in-memory Catalog
let state = { installing: null, lastError: null }  // MarketplaceState

module.exports = {
  handlers: {
    'marketplace/catalog':   () => catalog || readCachedCatalog(),
    'marketplace/refresh':   () => refreshCatalog(),
    'marketplace/available': () => computeAvailable(),
    'marketplace/installed': () => listInstalled(),
    'marketplace/install':   (event, p) => gate(event, () => installPlugin(p && p.id, p && p.version)),
    'marketplace/uninstall': (event, p) => gate(event, () => uninstallPlugin(p && p.id)),
  },
  start(b) { broadcast = b; ensureDirs(); readCachedCatalog(); refreshCatalog().catch(()=>{}) },
  // exported for the deep link:
  focusDetail(id, version) { if (broadcast) broadcast('marketplace/focus-detail', { id, version }) },
}
```

### 3.3 `installPlugin(id, version?)` — the safety-critical path

```
1. Resolve entry: from catalog (or GET latest.json for an explicit version). 404 -> error.
2. Compat gate: if entry.engines.alpineShell present and NOT satisfiesRange(app.getVersion())
   -> reject 'incompatible' (never install a build we can't run). apiVersion gate likewise.
3. Download bundle via net.fetch(new URL(entry.url, MARKETPLACE_BASE_URL)) -> temp file in .staging.
4. Verify sha256(tempFile) === entry.sha256 (hex, constant-time compare). Mismatch -> abort+delete.
5. Verify Ed25519: crypto.verify(null, sha256DigestBuffer, PUBLIC_KEY, base64->Buffer(entry.signature)).
   Fail -> abort+delete. THIS GATE IS MANDATORY and blocks any bundle not signed by our key.
6. Extract into .staging/<id>-<ver>/ with tar.exe (bsdtar reads zip):
       spawnSync('tar', ['-xf', tempFile, '-C', stagingDir])
   Then POST-EXTRACT CONTAINMENT: walk stagingDir, reject any entry that is a symlink (lstat)
   or whose realpath escapes realpath(stagingDir). Assert plugin.json exists at root and
   its id === id. Any violation -> rm -rf staging, abort.
7. Atomic swap into userData/plugins/<id>:
       - if target exists (update): rename target -> .trash/<id>-<ts> (retry; on EBUSY leave for boot cleanup)
       - rename .staging/<id>-<ver> -> plugins/<id>   (same-volume rename = atomic)
8. broadcast('plugins/reload')  (existing loader re-scans; widget appears, no restart)
9. clear .staging temp + tempFile; update state; broadcast('marketplace/state-changed').
```

`sha256` compare uses `crypto.timingSafeEqual` on equal-length buffers. Signature verify is over the **digest bytes** exactly as signed (§1.2).

### 3.4 `uninstallPlugin(id)`

```
1. SAFE_ID check (reuse plugins.SAFE_ID semantics; reject preset ids — presets live in resources, not userData).
2. fs.rmSync(plugins.getPluginsDir()/id, { recursive:true, force:true });
   on EBUSY/EPERM -> rename into .trash/<id>-<ts> (cleared next boot).
3. Also clear the disabled-set entry if present (call plugins.setEnabled(id,true) semantics or leave —
   pluginState.json holds only ids; a stale disabled id is harmless).
4. broadcast('plugins/reload') + state-changed.
```

### 3.5 `.trash` cleanup on boot

`ensureDirs()` on `start()` also `rmSync`es everything under `.trash/` (best-effort, ignore errors) and stale `.staging/` — same idea as the RFC's locked-dir retry.

### 3.6 `computeAvailable()` + `hasUpdate`

`available = catalog.plugins` annotated: `installed?` (folder exists under `plugins/<id>`), `installedVersion` (read that folder's `plugin.json` version if present — note the shipped manifest has no `version` field yet; treat missing as `0.0.0`), and `hasUpdate = installed && semverGt(entry.version, installedVersion)`. `satisfiesRange`/`semverGt` come from the SDK once it exists; until then a local minimal semver compare (same shape as `compareVersionsDescending` in `publish.js`) lives in the module.

---

## 4. Settings-window gating (`isTrustedSender`)

There is **no** `isTrustedSender` in the tree today (grep confirmed). This subsystem introduces the minimal positive registry the RFC calls for, scoped to just what marketplace needs:

- In `main.js` `createSettingsWindow()`, after creation: `trustedSenders.add(settingsWin.webContents.id)`, and on `'closed'` remove it. Export `isTrustedSender(event)` from a tiny `electron/trustedSenders.js` (a `Set<number>` + `add/remove/has(event.sender.id)`).
- `gate(event, fn)` in the marketplace module returns `{ ok:false, error:'forbidden' }` when `!isTrustedSender(event)`. **All mutating channels (`install`, `uninstall`) go through `gate`.** Read channels do not.

This same registry is what the broader plugin-management gating (RFC §6.6 "Unscoped `plugins/reload`/`list`") will reuse — introducing it here is the concrete first use.

---

## 5. `alpine-shell://install-plugin` deep link (consent-only, never auto-installs)

### 5.1 Registration + single instance (`main.js`)

The app currently has **no** single-instance lock or protocol client (grep confirmed). Add, early in `app.whenReady()` / before window creation:

```js
if (!app.requestSingleInstanceLock()) { app.quit(); return }
app.setAsDefaultProtocolClient('alpine-shell')   // dev: pass process.execPath + argv[1]

app.on('second-instance', (_e, argv) => { handleDeepLink(argvDeepLink(argv)) })
app.on('open-url', (_e, url) => handleDeepLink(url))  // harmless on Windows; future-proof
```

`argvDeepLink(argv)` finds the `alpine-shell://` token in `argv` (Windows delivers the URL as a CLI arg to the second instance).

### 5.2 Handler — focus only, never install

```js
function handleDeepLink(url) {
  if (!url) return
  let u; try { u = new URL(url) } catch { return }
  if (u.protocol !== 'alpine-shell:' || u.hostname !== 'install-plugin') return
  const id = u.searchParams.get('id')
  const version = u.searchParams.get('version') || undefined
  if (!id || !SAFE_ID.test(id)) return
  createSettingsWindow()                                  // focuses if already open
  const send = () => pluginMarketplace.focusDetail(id, version)  // broadcasts marketplace/focus-detail
  if (settingsWin.webContents.isLoading()) settingsWin.webContents.once('did-finish-load', send)
  else send()
}
```

The renderer's marketplace page listens via `window.plugins.marketplace.onFocusDetail(({id,version}) => navigate to detail)`. **Install still requires a real user click on the settings detail page + (Phase 2) the consent modal.** A drive-by web page can at most surface the detail page; it can never trigger `marketplace/install` (that channel is settings-only, invoked by a user gesture inside the trusted settings window). This is the exact §4.9 requirement.

---

## 6. R2 → Railway bucket migration

### 6.1 Difficulty verdict: **LOW (code) — the effort is provisioning, not programming.**

Both Cloudflare R2 and a Railway MinIO/S3 service speak the **S3 API**. The only code deltas are: (a) parameterize the `S3Client` endpoint/region/path-style, (b) rename env vars with back-compat, (c) flip two public-URL constants. No SDK change (`@aws-sdk/client-s3` already in devDeps), no rewrite of upload/list/prune logic. Estimated code change: ~1 new 40-line file + ~15 edited lines across `publish.js`/`package.json`/`pluginMarketplaceContract.js`. The real work is a MinIO service + public-read + CORS on Railway, which is **user provisioning**, not code.

### 6.2 The code plan — a shared storage factory

New `scripts/storage.js` (used by both `publish.js` and `publishPlugin.js`):

```js
// scripts/storage.js
const { S3Client } = require('@aws-sdk/client-s3')

// Back-compat: prefer STORAGE_*, fall back to legacy R2_*.
function readStorageEnv() {
  const e = process.env
  const endpoint = e.STORAGE_ENDPOINT
    || (e.R2_ACCOUNT_ID ? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined)
  const cfg = {
    endpoint,
    region: e.STORAGE_REGION || 'auto',
    accessKeyId: e.STORAGE_ACCESS_KEY_ID || e.R2_ACCESS_KEY_ID,
    secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY || e.R2_SECRET_ACCESS_KEY,
    bucket: e.STORAGE_BUCKET || e.R2_BUCKET,
    // MinIO/Railway need path-style; R2 works with either. Default true when STORAGE_ENDPOINT is set
    // to a non-R2 host, else honor explicit STORAGE_FORCE_PATH_STYLE.
    forcePathStyle: e.STORAGE_FORCE_PATH_STYLE === 'true'
      || (!!e.STORAGE_ENDPOINT && !/\.r2\.cloudflarestorage\.com$/.test(new URL(e.STORAGE_ENDPOINT).host)),
  }
  const missing = ['endpoint','accessKeyId','secretAccessKey','bucket'].filter(k => !cfg[k])
  if (missing.length) { console.error(`Missing storage config: ${missing.join(', ')}`); process.exit(1) }
  return cfg
}

function createStorageClient(cfg) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}
module.exports = { readStorageEnv, createStorageClient }
```

Then in `scripts/publish.js`: delete `requiredEnvVars`/`readEnv`/`createClient`, import `{ readStorageEnv, createStorageClient }`, and replace `readEnv()`/`createClient(config)` with `const cfg = readStorageEnv(); const client = createStorageClient(cfg)`. Everything else (`uploadArtifact`, `pruneOldReleases`) is untouched — `Bucket: cfg.bucket`.

### 6.3 Env-var / endpoint plan (exact)

| New (generic) | Legacy (still honored) | Railway value |
|---|---|---|
| `STORAGE_ENDPOINT` | *(derived from `R2_ACCOUNT_ID`)* | `https://<minio-service>.up.railway.app` (or internal `http://minio.railway.internal:9000` for CI in-project) |
| `STORAGE_REGION` | *(was hardcoded `auto`)* | `us-east-1` (MinIO default; any value works) |
| `STORAGE_ACCESS_KEY_ID` | `R2_ACCESS_KEY_ID` | MinIO access key |
| `STORAGE_SECRET_ACCESS_KEY` | `R2_SECRET_ACCESS_KEY` | MinIO secret key |
| `STORAGE_BUCKET` | `R2_BUCKET` | e.g. `alpine-plugins` |
| `STORAGE_FORCE_PATH_STYLE` | *(n/a)* | `true` (MinIO requires path-style) |

Update the GitHub Actions `release.yml` env block to pass the `STORAGE_*` secrets (keep `R2_*` during transition; the factory prefers `STORAGE_*`).

**Two public-URL constants flip to the Railway public read URL:**
1. `package.json → build.publish.url` — the electron-updater channel (installer + `latest.yml`). If the installer updates move too, point at the Railway bucket's public base; **or keep updates on R2 and only migrate plugins** (see §6.6).
2. `pluginMarketplaceContract.MARKETPLACE_BASE_URL` — the catalog + bundle read base. This is the only place the marketplace client resolves keys, so flipping it retargets all installs. Because catalog `url`/`iconUrl` are relative keys, **no catalog data needs rewriting.**

### 6.4 What the USER must provision on Railway (NOT code)

1. **A MinIO service** (Railway has a MinIO template) *or* any S3-compatible bucket service. Note the API endpoint (`:9000` internally; the generated public domain externally) and the console.
2. **Create the bucket** (`STORAGE_BUCKET`, e.g. `alpine-plugins`).
3. **Public read** on the plugin prefix: set an anonymous **download** policy on `plugins/*` (MinIO: `mc anonymous set download myminio/alpine-plugins`, or a bucket policy granting `s3:GetObject` to `*` on `arn:aws:s3:::alpine-plugins/plugins/*`). The desktop client fetches bundles/catalog **unauthenticated**, exactly like the R2 `pub-*.r2.dev` URL.
4. **Credentials:** an access key/secret pair with read+write on the bucket → the `STORAGE_*` secrets (GitHub Actions + local). Publishing is authenticated; reading is anonymous.
5. **CORS** on the bucket so `apps/web` (`/plugins` server component reads server-side, but any client-side fetch or the detail page's icon) and the desktop `net.fetch` origins are allowed: allow `GET, HEAD` from `*` (or the web origin + `alpine-plugin://`/desktop null origin) on the `plugins/*` prefix. MinIO CORS is set via `mc` or the config; this is a console/CLI step, not code.
6. **Persistent volume** attached to the MinIO service (Railway MinIO template includes one) so objects survive redeploys.

### 6.5 Migration of existing objects (one-time, optional)

If any plugin objects already live in R2: `rclone copy r2:alpine-plugins/plugins railway:alpine-plugins/plugins` (or `aws s3 sync` with two endpoint profiles). Pure ops, no code. For a first launch of the marketplace there is nothing to migrate.

### 6.6 Recommended split (lowest risk)

Keep **installer auto-updates on R2** (proven, `build.publish.url` unchanged) and migrate **only the plugin marketplace** to Railway by flipping `MARKETPLACE_BASE_URL` + pointing `publishPlugin.js` at `STORAGE_*`. This isolates the new, less-proven storage to the new feature and leaves the critical update channel untouched. The shared `scripts/storage.js` factory supports both by env alone — `publish.js` (updates) can read one set of `R2_*`/`STORAGE_*`, `publishPlugin.js` (plugins) another, if you scope the env per CI step.

---

## 7. RELEASING.md additions (doc-only)

Add a "Publishing a plugin" section: `bun run publish:plugin <dir>`; the required `ALPINE_PLUGIN_SIGNING_KEY` + `STORAGE_*` env; the Railway provisioning checklist (§6.4); and a note that `MARKETPLACE_PUBLIC_KEY` in `pluginMarketplaceContract.js` must match the signing key. Add the `STORAGE_*` secrets to the GitHub Actions secrets list alongside the legacy `R2_*`.

---

## 8. File-by-file summary

| File | Action | Key exports / edits |
|---|---|---|
| `apps/desktop/electron/pluginMarketplaceContract.js` | **new** | `MARKETPLACE_PUBLIC_KEY`, `MARKETPLACE_BASE_URL`, `CATALOG_KEY`, `latestKey/bundleKey/iconKey`, `PACKAGE_EXT` |
| `apps/desktop/electron/trustedSenders.js` | **new** | `add/remove/has`, `isTrustedSender(event)` (Set of settings `webContents.id`) |
| `apps/desktop/electron/modules/pluginMarketplace.js` | **new** | `{ handlers, start(broadcast), focusDetail(id,version) }` — catalog fetch/cache, verify+install, uninstall |
| `apps/desktop/scripts/storage.js` | **new** | `readStorageEnv()`, `createStorageClient(cfg)` (generic S3, path-style, R2 back-compat) |
| `apps/desktop/scripts/publishPlugin.js` | **new** | pack (zip-slip/symlink-safe) → sha256 → Ed25519 sign → upload → roll up `index.json` + `latest.json` |
| `apps/desktop/scripts/publish.js` | **edit** | swap `readEnv`/`createClient` for `readStorageEnv`/`createStorageClient` |
| `apps/desktop/electron/main.js` | **edit** | single-instance lock; `setAsDefaultProtocolClient('alpine-shell')`; `second-instance`/`open-url` → `handleDeepLink`; register `pluginMarketplace` in `ipc.register(...)`; `trustedSenders.add` in `createSettingsWindow` |
| `apps/desktop/electron/preload.js` | **edit** | add `marketplace` object to the `window.plugins` bridge (§0.3) |
| `apps/desktop/package.json` | **edit** | `"publish:plugin"` script; (migration) flip `build.publish.url` only if migrating updates |
| `RELEASING.md` | **edit** | plugin publish section + Railway provisioning + `STORAGE_*` secrets |
| `apps/web/src/app/plugins/**` | **consumes** | reads the same `index.json`; **Install** button → `alpine-shell://install-plugin?id=&version=` (other subsystem, listed for contract completeness) |

---

## 9. What stays GATED (explicit)

- **Untrusted install remains curated.** `index.json` is single-writer; `verified:true` is the curation flag. No third-party submission endpoint ships here. Sideloaded/unsigned bundles are not installable via this module — **install refuses any bundle failing the Ed25519 check against `MARKETPLACE_PUBLIC_KEY`.**
- **No backend fork from marketplace installs** in this phase; a downloaded plugin's `main` is inert until the Tier-B sandbox + signing-gated `node` grant (RFC Phase 2/3) exist. Install lands a folder the *existing Tier-A loader* runs in-process — so **the store must list first-party/vetted only** until the sandbox lands. This is a curation guarantee, enforced by the human-controlled catalog, not by runtime isolation yet.
- **The deep link never installs** — focus-only, settings-only mutation, as designed.
- **Migration of the update channel is optional/deferred** (§6.6); the marketplace can move to Railway independently.

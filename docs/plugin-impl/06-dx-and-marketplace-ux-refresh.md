# 06 — DX & Marketplace UX Refresh

> **Scope:** A prioritized (P0/P1/P2), concrete, file-by-file recommendations doc for everything *around* the plugin runtime that makes Alpine Shell plugins pleasant to **build** and pleasant to **discover/install**. This is the "refresh" layer on top of the RFC (`docs/plugin-system.md`) and the shipped slice (`electron/modules/plugins.js` folder-drop loader + `window.alpine` runtime v2).
>
> **Companion to:** the RFC §7 (SDK/quickstart), §8 (marketplace), §5 (slot refactors). This doc does not redesign the runtime, the capability broker, or signing — it specifies the developer-facing and user-facing surfaces that turn the runtime into a *product*.
>
> **Trust model today = curation (Tier A only, trusted).** Everything here that touches untrusted install, ratings-write, or signing is explicitly marked **GATED** and must not ship enabled until the Phase 2 sandbox (RFC §4.4) and Phase 3 signing (RFC §4.10) land. What ships today is dev-experience for trusted authors + a *read-only, install-via-consent* marketplace listing that renders publisher-supplied metadata.

---

## 0. Where we are today vs. where this doc takes us

| Concern | Shipped today | This doc's target |
|---|---|---|
| Authoring | Two hand-written files, `window.alpine.h`, no build, no types | `npm create alpine-plugin`, JSX via SDK, typed `useShell`, hot-reload |
| Author feedback loop | Copy folder → click "Reload plugins" | `alpine plugin dev` → dev-link + `fs.watch` → in-process hot-reload |
| Errors | Swallowed to `console.error` in `loadPlugins.ts`/`plugins.js` | Structured error surfaced in Plugins page + dev console overlay |
| Packaging/publish | none | `alpine plugin build/pack/publish` → `<id>.alpineplugin` |
| Discovery | Manual folder drop | Web `/plugins` + in-shell Marketplace tab |
| Listing content | `name` + `id` only (`plugins/list`) | README.md + icon + screenshots + per-permission rationale rendered |
| Consent | none (runs with full shell access) | Consent modal built from manifest (GATED on Tier B) |
| Trust signal | "Preset" badge | Verified / Unverified badge, downloads, ratings, changelog |

The two shared contracts this doc introduces that **other subsystems depend on** are the **manifest metadata block** (`marketplace` / listing fields — §MKT-1) and the **structured plugin-error shape** (`PluginLoadError` — §DX-6). Both are defined below and both live in `@alpine/plugin-sdk` so main, renderer, CLI, and `apps/web` share one source.

---

# PART A — DEVELOPER EXPERIENCE

## DX-0 (P0) — The `@alpine/plugin-sdk` package (prerequisite for everything)

**What.** The dual-built (tsup → ESM + CJS + `.d.ts`) workspace package described in RFC §3.6/§7.1. Everything in Part A depends on it existing. It is the *first* thing to build because it is the single source of the shared constants (`PLUGIN_PERMISSIONS`, `PLUGIN_ID_PATTERN`, `SUPPORTED_API_VERSIONS`, `PLUGIN_API_VERSION`, `satisfiesRange`), the contribution/manifest **types**, the theme hooks, and — new in this doc — the **listing metadata types** (§MKT-1) and the **error shape** (§DX-6).

**Why it improves UX.** Today an author writes untyped `window.alpine.h(...)` with no autocomplete and no compile-time check that their `plugin.json` is valid. The SDK gives real types, real JSX, and a build config in one line. It also kills the DRY hazard the RFC flags (permission list duplicated between TS and CJS validator).

**Effort.** M (2–3 days for the skeleton; grows across phases). Use `packages/license` as the workspace template (`type:module`, workspace `exports`) but add a `tsup` build (license is raw-TS; the SDK **must** emit CJS for `electron/*.js require()`).

**Files.**
- **+** `packages/plugin-sdk/package.json` — exports map from RFC §7.1 (`.`, `./react`, `./jsx-runtime`, `./vite`), `peerDependencies.react: ">=19"`, `scripts.build: "tsup"`, `scripts.typecheck`.
- **+** `packages/plugin-sdk/tsup.config.ts` — entries `src/index.ts` (format `['esm','cjs']`, dts), `src/react.ts`/`src/jsxRuntime.ts`/`src/vite.ts` (esm, dts), `react`/`react-dom` external.
- **+** `packages/plugin-sdk/src/constants.ts` — `PLUGIN_PERMISSIONS` (as `const` array + `PluginPermission` union), `PLUGIN_ID_PATTERN`, `PLUGIN_API_VERSION`, `SUPPORTED_API_VERSIONS`, `satisfiesRange(range, version)`.
- **+** `packages/plugin-sdk/src/manifest.ts` — `PluginManifest`, `PluginContributions`, `*Contribution`, `TopbarSlot`, `DisplayScope`, **and `PluginListingMeta` (§MKT-1)**.
- **+** `packages/plugin-sdk/src/errors.ts` — `PluginLoadError`, `PluginErrorCode` (§DX-6).
- **+** `packages/plugin-sdk/src/index.ts` — re-export the above + runtime hooks.
- **~** `apps/desktop/package.json` — add `"@alpine/plugin-sdk": "workspace:*"`; root build pipeline builds SDK before desktop (RFC §7.1).

**Contract exported (other subsystems import these):**
```ts
export const PLUGIN_PERMISSIONS = [/* … §4.7 tokens … */] as const
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number]
export const PLUGIN_ID_PATTERN: RegExp
export const PLUGIN_API_VERSION = 1
export const SUPPORTED_API_VERSIONS: ReadonlySet<number>
export function satisfiesRange(range: string, version: string): boolean
```

---

## DX-1 (P0) — `create-alpine-plugin` scaffold (`npm create alpine-plugin`)

**What.** A minimal scaffolder (`packages/create-alpine-plugin`) that prompts for a template + plugin id and writes the ~7-file project from RFC §7.3: `plugin.json`, `src/renderer.tsx`, `vite.config.ts`, `tsconfig.json` (`jsx:'react-jsx'`, `jsxImportSource:'@alpine/plugin-sdk'`), `package.json`, `README.md` (pre-stubbed with the metadata the marketplace renders — see §MKT-2), `.gitignore`. Templates: **Topbar widget (+ settings page)**, **Desktop widget**, **Launcher command**, **Backend data provider (signed-only, GATED label)**.

**Why.** This is the headline "5-minute first widget" promise (RFC §1.1). It removes every manual step — no hand-copying into `%APPDATA%`, no guessing the manifest shape, no forgetting the `jsxImportSource`. It also **seeds a well-formed README + metadata block**, which is what makes listings look good later (the two DX and marketplace goals reinforce each other).

**Effort.** M (1–2 days). A single `index.js` using `prompts` + template dirs. No custom registry logic — templates are static files with `__id__`/`__name__` token replacement.

**Files.**
- **+** `packages/create-alpine-plugin/package.json` — `bin: { "create-alpine-plugin": "./index.js" }`.
- **+** `packages/create-alpine-plugin/index.js` — prompt, copy template, token-replace, print "next: `cd x && npm install && npm run dev`".
- **+** `packages/create-alpine-plugin/templates/topbar-widget/**` (etc.) — the §7.3 files; `renderer.tsx` uses JSX + `useShell()` not `window.alpine.h`.
- The template's `package.json` scripts map `dev/build/pack/publish` to `alpine plugin *` (§DX-3).

**Decision needed (RFC Risk #3):** publish `create-alpine-plugin` + `@alpine/plugin-sdk` to **public npm**. Blocker for `npm create`. Recommend public npm under an `@alpine` org.

---

## DX-2 (P0) — Dev-link + `fs.watch` hot-reload (author loads in-process as Tier A)

**What.** The in-shell half of `npm run dev`. `electron/modules/pluginDev.js` (new, follows the `{ handlers, start(broadcast) }` module shape) owns a **dev-links file** `%APPDATA%\Alpine Shell\plugins\.dev-links.json` (`[{ id, dir }]`), `fs.watch`es each linked `dist/`, and on change calls `broadcast('plugins/reload')` (the exact channel `plugins.js`/`loadPlugins.ts` already listen for). The `alpine-plugin://` handler resolves a dev-linked id to the author's own project `dist/` instead of the userData copy. Hot-reload re-imports `renderer.js?v=<ts>` (the cache-bust already in `loadPlugins.ts:21`) and remounts via a changed React `key`.

**Why.** Turns the "copy folder → click Reload" loop (today) into save-to-reload in <1s with no shell restart. This is the single biggest daily-driver ergonomics win for an author. Because it's the author's **own** machine, they load **in-process (Tier A)** and get the full theme/`PopupMenu`/hooks experience with zero isolation penalty (RFC §4.3, §7.3) — the isolation cost is only paid by *installed third-party* plugins.

**Effort.** M (2–3 days). `fs.watch` on Windows is coalesce-noisy → debounce (reuse the frecency.js debounce pattern). The dev-links file must be **read-only from any IPC handler** (no `set` channel that a renderer can call — it's written only by the CLI on the author's disk) to keep the trust boundary honest.

**Files.**
- **+** `apps/desktop/electron/modules/pluginDev.js` — `{ handlers: { 'plugins/dev-links': () => read() }, start(broadcast) { watch all links; on change → broadcast('plugins/reload') } }`, plus exported `resolveDevLink(id)` used by the protocol handler.
- **~** `apps/desktop/electron/main.js:562` (alpine-plugin handler) — before `plugins.resolvePluginFile`, try `pluginDev.resolveDevLink(hostname)`.
- **~** `apps/desktop/electron/main.js:580` (ipc.register list) — add `pluginDev`.
- **~** `apps/desktop/electron/modules/plugins.js:112` (`listPlugins`) — merge dev-linked ids so they show in the Plugins page flagged `dev:true`.
- **~** `apps/desktop/src/plugins/loadPlugins.ts` — already handles `plugins/reload` via `window.plugins.onReload`; confirm the settings/topbar roots call `loadTopbarPlugins()` on that event (wire if missing).
- **CLI side** (§DX-3): `alpine plugin dev` writes the dev-links entry + starts Vite watch. It **appends to `.dev-links.json` on disk directly** (author's machine), never via IPC.

---

## DX-3 (P0-lite / P1-full) — `@alpine/plugin-cli` (`alpine plugin dev|build|pack|publish`)

**What.** A thin CLI wrapping Vite + the archive/publish steps.
- `alpine plugin dev` — start Vite in watch/lib mode + register the dev-link (§DX-2). **P0** (needed for the hot-reload loop).
- `alpine plugin build` — `vite build` producing `dist/renderer.js` (+ `.css`). **P0**.
- `alpine plugin pack` — zip the folder (root = `plugin.json`) into `<id>.alpineplugin` with per-entry zip-slip-safe layout; validate the manifest against the SDK schema first; **fail if README/icon missing** (nudges good listings). **P1**.
- `alpine plugin publish` — sign (GATED) + upload via `scripts/publishPlugin.js`. **P1/P3** (needs signing key + R2 creds).
- `alpine plugin validate` — run the same manifest validation the host runs, printing human errors. Cheap, high-value. **P0**.

**Why.** One memorable command surface. `dev`/`build`/`validate` are the daily loop; `pack`/`publish` are the one-command publish promise (RFC §1.1). Bundling validation into the CLI means authors catch manifest mistakes before install instead of via a silent `console.error`.

**Effort.** `dev/build/validate` = S–M (reuse Vite + SDK validator). `pack` = S (tar.exe/zip). `publish` = M and GATED on signing/R2.

**Files.**
- **+** `packages/plugin-cli/package.json` — `bin: { "alpine": "./index.js" }`, dep on `vite` + `@alpine/plugin-sdk`.
- **+** `packages/plugin-cli/index.js` — subcommand dispatch.
- **+** `packages/plugin-cli/commands/{dev,build,pack,publish,validate}.js`.
- Reuses **`scripts/publish.js`** shape for `publish` (RFC §8.2) and the SDK validator for `validate`.

---

## DX-4 (P0) — JSX via the SDK jsx-runtime (retire `window.alpine.h` for authors)

**What.** Ship `@alpine/plugin-sdk/jsx-runtime` binding **real** `jsx/jsxs/Fragment` from the host React (RFC §5.2 — real values, not proxies), plus `@alpine/plugin-sdk/react` re-exporting hooks. Author code becomes plain JSX (`return <span>{temp}°</span>`) with `jsxImportSource: '@alpine/plugin-sdk'` in `tsconfig`. The legacy `window.alpine.h` global stays for back-compat with the shipped `claude-code-usage` preset but is **removed from all docs/templates**.

**Why.** `window.alpine.h('div', {...}, ...)` is the single most-cited pain point in the shipped README (`examples/plugins/README.md` even apologizes: "there's no JSX because there's no build step"). JSX + typed hooks is the difference between "a hobbyist tolerates it" and "a React dev feels at home."

**Effort.** M (the runtime plumbing is already scoped in RFC §5.2; the import-map into `index.html` is the fiddly part). Depends on DX-0.

**Files.**
- **+** `packages/plugin-sdk/src/jsxRuntime.ts` — `export const { jsx, jsxs, Fragment } = getHost().jsxRuntime` (lazy `getHost()`).
- **+** `packages/plugin-sdk/src/react.ts` — re-export `useState`/`useEffect`/… from the host React global.
- **~** `apps/desktop/index.html` — inject the react/react-dom/jsx-runtime import-map (RFC §5.2, §10).
- **~** `apps/desktop/src/plugins/pluginRuntime.ts` — publish `jsxRuntime` on the runtime object alongside the existing `h`/`Fragment` (keep `h` for the legacy preset).
- **~** `apps/desktop/examples/plugins/README.md` + all `create-alpine-plugin` templates — switch to JSX.

---

## DX-5 (P1) — Typed `useShell()` / capabilities client

**What.** `useShell()` returns a capability-scoped, **typed** client whose method surface is generated from the enumerated route table (RFC §4.5 `capabilityRoutes`) intersected with the plugin's granted permissions. E.g. `const shell = useShell(); await shell.volume.get()` — with a compile error if the plugin didn't declare `read:volume`. Under the hood it's `window.alpinePlugin.invoke(action, payload)` (Tier B) or the in-process broker (Tier A); the author sees one typed object.

**Why.** Replaces the untyped `usePluginData(channel, initial)` string-channel pattern (shipped today) with discoverable, autocompleted capabilities and turns "did I request the right permission?" from a runtime `{ok:false,error:'denied'}` into a red squiggle.

**Effort.** M. The type is a mapped type over `PLUGIN_PERMISSIONS`; the runtime is a thin dispatcher. Depends on the broker (Phase 2) for real capabilities, but the **typed shape + `usePluginData`/`usePluginBackendState` hooks** can ship against today's `plugins/data-get` immediately.

**Files.**
- **+** `packages/plugin-sdk/src/hooks.ts` — `usePluginSetting`, `usePluginState`, `usePluginBackendState`, `useShell` (RFC §7.2).
- **+** `packages/plugin-sdk/src/shellClient.ts` — the typed dispatcher + route-surface type.
- **~** `apps/desktop/src/plugins/pluginRuntime.ts` — expose `invoke` on the runtime for Tier A.

---

## DX-6 (P0) — Structured error surfacing (Plugins page + dev console)  ⚑ SHARED CONTRACT

**What.** Replace the three swallowed `console.error` sites (`loadPlugins.ts:13/25`, `plugins.js` manifest parse) with a **structured `PluginLoadError`** captured per plugin and surfaced in the Plugins page as an inline error row, and (dev) as a console overlay. Categories: manifest-parse, missing-export, import-failed, incompatible-api, incompatible-engine, render-crash (from `PluginErrorBoundary`), backend-crash.

**Why.** Today a broken plugin fails silently — the author sees nothing in the UI and has to open devtools. Clear, categorized errors ("`TopbarWeather` export not found in dist/renderer.js", "requires Alpine ^0.3.0, you have 0.2.1") are the difference between a 30-second fix and a bug report. This is table-stakes for a real plugin platform.

**Effort.** M. The shape is small; the work is threading it through the load path and rendering it.

**Files.**
- **+** `packages/plugin-sdk/src/errors.ts` — the shared shape (below).
- **~** `apps/desktop/src/plugins/loadPlugins.ts` — catch → build `PluginLoadError`, push into a new errors store.
- **+** `apps/desktop/src/plugins/pluginErrors.ts` — `useSyncExternalStore` errors store keyed by pluginId (mirrors `pluginRegistry.ts`).
- **~** `apps/desktop/src/components/settings/pluginsPage.tsx` — render an error/warning row under a faulted plugin (reuse the existing list-item styling).
- **~** `apps/desktop/electron/modules/plugins.js:88` — return the parse error text (not just `null`) so the page can show it.

**Contract (imported by renderer + CLI `validate`):**
```ts
export type PluginErrorCode =
  | 'manifest-parse' | 'missing-export' | 'import-failed'
  | 'incompatible-api' | 'incompatible-engine' | 'render-crash' | 'backend-crash'
export interface PluginLoadError {
  pluginId: string
  code: PluginErrorCode
  message: string        // human-readable, shown in UI
  detail?: string        // stack / raw parse error, shown in dev console
  contribution?: string  // the export/surface that failed, if applicable
}
```

---

## DX-7 (P1) — Plugin template repo + docs site

**What.** (a) A public `alpine-plugin-template` GitHub repo mirroring the scaffold output (for "Use this template" users who don't want `npm create`). (b) A docs section on `apps/web` (`/docs/plugins`) generated from the RFC + SDK type reference — quickstart, manifest reference, permission catalog with rationale copy, the `useShell` API, publishing.

**Why.** The template repo is the low-effort on-ramp; the docs site is where authors live after minute 5. The permission catalog copy (`PERMISSION_META`) is **reused verbatim** by the consent modal and the marketplace listing (§MKT-3) — write it once.

**Effort.** S (template repo) + M (docs site, mostly content).

**Files.**
- **+** external repo `alpine-plugin-template` (or `examples/` in-repo mirror).
- **+** `apps/web/src/app/docs/plugins/**` (App Router MDX).
- **+** `packages/plugin-sdk/src/permissionMeta.ts` — `PERMISSION_META: Record<PluginPermission, { label, description, risk }>` (single source for docs + consent + listing).

---

# PART B — MARKETPLACE UX

> **Trust posture:** the listing surfaces below are **read-only + install-via-consent**. Nothing here auto-installs (RFC §4.9: the deep link only focuses the detail page). Rendering publisher-supplied README/screenshots is safe *as content* (sanitized markdown, `img-src` locked); it does not run plugin code. Write paths (ratings, submission) are **GATED** behind the Phase 3 review pipeline.

## MKT-1 (P0) — The listing metadata block  ⚑ SHARED CONTRACT

**What.** Extend the manifest with an optional `marketplace` block that carries everything a listing renders. This is the schema `apps/web`, the in-shell Marketplace, and the CLI `pack` validator all read. The user's explicit ask — *"the plugin contains a md with that info that gets displayed"* — is satisfied by `readme` (path to the bundled README.md, rendered on the detail page) plus per-permission `rationale`.

**Why.** Turns a bare `{name,id}` row into a rich store listing sourced entirely from the plugin package itself — no separate CMS. The author writes it once (scaffolded by §DX-1) and it renders identically on web and in-shell.

**Effort.** S (schema + types). It's declarative; the rendering is §MKT-2/§MKT-3.

**Contract (in `@alpine/plugin-sdk/manifest.ts`, consumed by web + shell + CLI):**
```ts
export interface PluginListingMeta {
  readme?: string                 // rel path, default "README.md" — rendered as sanitized markdown
  icon?: string                   // "assets/icon.png" | "lucide:CloudSun" (already in manifest.icon)
  screenshots?: string[]          // rel paths under assets/, shown in a carousel
  categories?: string[]           // from a curated CATEGORIES enum (below)
  keywords?: string[]             // free-text search terms
  changelog?: string              // rel path "CHANGELOG.md", rendered on Version History
  permissionRationale?: Partial<Record<PluginPermission, string>>  // why each perm is needed
  screenshotAlt?: string[]        // a11y captions, index-aligned with screenshots
}
export const PLUGIN_CATEGORIES = [
  'productivity','system','media','developer','information','fun','appearance'
] as const
export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]
```
Add `marketplace?: PluginListingMeta` to `PluginManifest`. All paths get the **same realpath-confinement** validation as `renderer`/`icon` (RFC §3.3) — a screenshot path can't escape the plugin dir.

---

## MKT-2 (P0) — Plugin detail page renders README + icon + screenshots

**What.** `apps/web` `/plugins/[id]` server component that reads `plugins/<id>/latest.json` from R2 (RFC §8.2) and renders: header (icon, name, author, Verified/Unverified badge, version, download count), an **Install** button (`alpine-shell://install-plugin?id=&version=`), a screenshot carousel, the **rendered README.md** (sanitized markdown), the permission list with rationale (§MKT-3), and Version History (§MKT-6). Mirror the same detail view **in-shell** as a Marketplace settings tab so users never leave the shell to browse.

**Why.** This is the marketplace's storefront and directly answers the user's "md that gets displayed" requirement. A rendered README + screenshots is the single biggest driver of install confidence.

**Effort.** M (web page + markdown render + carousel) + M (in-shell mirror). Markdown must be sanitized (`rehype-sanitize`); `img-src` limited to the R2 origin.

**Files.**
- **+** `apps/web/src/app/plugins/page.tsx` — index (grid of cards from `index.json`), search/filter (§MKT-4).
- **+** `apps/web/src/app/plugins/[id]/page.tsx` — detail (README + screenshots + permissions + versions).
- **+** `apps/web/src/lib/pluginCatalog.ts` — fetch `index.json`/`latest.json`, typed against `PluginListingMeta`.
- **+** `apps/web/src/components/plugins/{PluginCard,ScreenshotCarousel,PermissionList,MarkdownReadme}.tsx`.
- **+ (in-shell)** `apps/desktop/src/components/settings/marketplacePage.tsx` + `marketplaceDetail.tsx` — reuse the same components' logic via `net.fetch` of the catalog through a new read-only `electron/modules/pluginMarketplace.js` (RFC §8.2, `catalog`/`detail` handlers stay open; mutating handlers `isTrustedSender`-gated).

---

## MKT-3 (P0) — Per-permission rationale on the listing + consent modal

**What.** On the detail page and in the consent modal (RFC §4.9), each requested permission renders as a row: **plain-language label + description** (from `PERMISSION_META`, §DX-7) + **risk badge** + the **author's `permissionRationale[perm]`** ("Weather needs `net:fetch` to reach api.open-meteo.com") + the derived **data-flow line** (which `read:*` scopes can leave to which `network.connect` host, RFC §4.9). Auto-tier permissions render muted; Sensitive (T3) render with a warning color.

**Why.** This is informed consent as UX, not legalese. Seeing *why* a plugin wants each capability — in the author's words plus the host's risk framing — is what makes users comfortable installing, and what makes a bad ask obvious.

**Effort.** S (the data exists in the manifest; this is presentation). The consent modal itself is Phase 2 (GATED to Tier B), but the **read-only rationale display on the web/in-shell listing ships in P0**.

**Files.**
- **+** `apps/desktop/src/components/settings/pluginConsentDialog.tsx` — GATED (Phase 2), but built from the same `PermissionList` component.
- **~** `apps/web/src/components/plugins/PermissionList.tsx` — merge `PERMISSION_META` + `permissionRationale` + data-flow.
- Reuses `packages/plugin-sdk/src/permissionMeta.ts` (§DX-7).

---

## MKT-4 (P1) — Categories, keywords, search

**What.** The `/plugins` index and in-shell Marketplace tab support filtering by `categories`, free-text search over `name`/`description`/`keywords`, and a sort (downloads / recent / rating). Categories come from the curated `PLUGIN_CATEGORIES` enum (§MKT-1) so the taxonomy is stable.

**Why.** Once there are >10 plugins, browsing needs structure. Categories + search is the minimum for discovery.

**Effort.** S–M. Client-side filter over the already-fetched `index.json` is enough at launch (no backend query needed until the catalog is large).

**Files.**
- **~** `apps/web/src/app/plugins/page.tsx` — filter/search/sort UI + logic.
- **~** `apps/desktop/src/components/settings/marketplacePage.tsx` — same.
- **~** `apps/web/src/lib/pluginCatalog.ts` — index shape includes `categories`/`keywords`/`downloads`.

---

## MKT-5 (P1) — Verified / Unverified badge

**What.** A badge on cards + detail derived from signature verification (RFC §4.10). Verified = signed against the bundled `MARKETPLACE_PUBLIC_KEY`. Unverified = sideloaded/unsigned → capped at Tier B, no backend, no auto-enable (RFC §4.10). On the web listing the badge reflects the catalog's `verified` flag; in-shell it reflects the *actual* load-time verification result.

**Why.** The single most important trust signal. It tells the user at a glance whether a plugin went through the supply chain or is raw sideload. It also visibly enforces the "curation today" posture: until signing lands, everything in the store is first-party/vetted and the badge says so honestly.

**Effort.** S (badge UI) — but the *meaning* is GATED on signing (Phase 3). Ship the badge component now rendering "First-party" for presets; wire to real Ed25519 verification when §4.10 lands.

**Files.**
- **+** `apps/desktop/src/components/settings/verifiedBadge.tsx` + web equivalent.
- **~** catalog/registry to carry `verified: boolean` / `firstParty: boolean`.

---

## MKT-6 (P1) — Version history + changelog

**What.** Detail page "Versions" section listing prior versions (from `plugins/<id>/` R2 prefix) with each version's `CHANGELOG.md` entry rendered (from `marketplace.changelog`). Shows "Updated 3 days ago", size, and engine compatibility per version.

**Why.** Users (and reviewers) want to see what changed before updating. Changelog is expected of any real store.

**Effort.** S–M. Versions come free from the R2 prefix listing; changelog is markdown render.

**Files.**
- **~** `apps/web/src/app/plugins/[id]/page.tsx` — Versions section.
- **~** `scripts/publishPlugin.js` — keep prior `<version>/` immutable (RFC §8.2 already specifies immutable bundles); write `latest.json` history array.

---

## MKT-7 (P1) — Update-available affordance

**What.** `PluginRecord.hasUpdate` (RFC §8.4 `pluginUpdater.js`) drives an "Update available → v0.2.0" pill on the installed-plugins list in `pluginsPage.tsx`, with a one-click Update that re-runs consent **only if new permissions were requested** (RFC §4.9). Compat-gated by `engines.alpineShell` so the shell never offers a build it can't run.

**Why.** Closes the loop between a published new version and the user actually getting it. Re-consent-on-new-permission is the security-correct behavior the RFC mandates.

**Effort.** M. Needs `pluginUpdater.js` (Phase 3) + the diff-permissions check.

**Files.**
- **+** `apps/desktop/electron/modules/pluginUpdater.js` (RFC §8.4).
- **~** `apps/desktop/src/components/settings/pluginsPage.tsx` — the update pill + action.

---

## MKT-8 (P1-read / P2-write) — Ratings & downloads (Cloudflare D1)

**What.** A D1 table behind an `apps/web` route handler (RFC §8.3): `downloads` (incremented on install-confirm), `ratings` (1–5 + optional short review). **Reads** (aggregate count + average) render on cards/detail — ships in the P1 read-only pass. **Writes** (submitting a rating) are **GATED** behind auth + anti-abuse (Phase 2/3) so the numbers can't be gamed by a drive-by.

**Why.** Downloads + ratings are the social-proof layer that separates "a list of folders" from "a marketplace." Downloads alone (no auth needed to *read*, incremented server-side on install) is high-value and low-risk; ratings need abuse controls.

**Effort.** Reads S–M (one D1 table + a route). Writes M+ (auth, rate-limit, moderation) — GATED. Railway Postgres is a fine alternative if you'd rather not use D1; the route contract is the same.

**Files.**
- **+** `apps/web/src/app/api/plugins/[id]/downloads/route.ts` — GET count, POST increment (server-side, on verified install callback).
- **+** `apps/web/src/app/api/plugins/[id]/ratings/route.ts` — GET aggregate (open); POST (GATED).
- **+** D1 schema migration `apps/web/migrations/0001_plugins.sql` — `downloads(plugin_id, count)`, `ratings(plugin_id, user_hash, stars, review, created_at)`.

**Route contract (consumed by web + in-shell listing):**
```
GET  /api/plugins/:id/downloads → { count: number }
GET  /api/plugins/:id/ratings   → { average: number, count: number }
POST /api/plugins/:id/ratings   → { ok } | 401   (GATED)
```

---

## MKT-9 (P0) — One-click install via deep link + consent modal

**What.** The **Install** button on any listing fires `alpine-shell://install-plugin?id=<id>&version=<v>`. The desktop registers `alpine-shell://` (`app.setAsDefaultProtocolClient`) with a single-instance `second-instance` handler that — per RFC §4.9 — **only focuses the Settings Marketplace detail page for that id**; a real user click on **Install** there + the consent modal are required. Drag-install of a local `.alpineplugin` reads the path via `webUtils.getPathForFile` (RFC §8.3; `File.path` is dead in Electron 40).

**Why.** This is the "one command to install" UX — click on the web, land on the in-shell detail, review permissions, confirm. The **never-auto-install** rule is what makes the deep link safe against drive-by pages.

**Effort.** M. Deep-link registration + single-instance handler + focus-detail routing. The consent modal itself is GATED (Phase 2) — until then, install is limited to first-party/dev (curation posture), and the button on the web can say "Available in Alpine Shell" for presets.

**Files.**
- **~** `apps/desktop/electron/main.js` — `setAsDefaultProtocolClient('alpine-shell')`, `second-instance` handler → focus Settings, navigate to `plugin-marketplace/<id>` (reuses the string-path history stack, RFC §5.4).
- **~** `apps/desktop/electron/preload.js` — expose `webUtils.getPathForFile` for drag-install (RFC §8.3).
- **~** `apps/web/src/app/plugins/[id]/page.tsx` — the Install button + deep link.
- **+** `apps/desktop/src/components/settings/pluginConsentDialog.tsx` — GATED (Phase 2).

---

## Priority rollup

| Pri | Developer experience | Marketplace UX |
|---|---|---|
| **P0** | DX-0 SDK package · DX-1 `create-alpine-plugin` · DX-2 dev-link hot-reload · DX-3 `dev`/`build`/`validate` CLI · DX-4 JSX runtime · DX-6 structured errors | MKT-1 listing metadata block · MKT-2 detail page (README + icon + screenshots) · MKT-3 per-permission rationale (read-only) · MKT-9 deep-link install (consent GATED) |
| **P1** | DX-3 `pack`/`publish` · DX-5 typed `useShell` · DX-7 template repo + docs | MKT-4 categories/search · MKT-5 Verified badge · MKT-6 version history/changelog · MKT-7 update affordance · MKT-8 downloads/ratings (read) |
| **P2 / GATED** | — | MKT-8 ratings **write** · consent modal enforcement · signing-backed Verified · untrusted install path (all Phase 2/3) |

## What must stay gated (do not ship enabled under today's curation model)
- Any **untrusted third-party install** that runs in-process (must wait for Tier B sandbox, RFC §4.4).
- The **consent modal as an enforcement boundary** (Phase 2) — until then, install is first-party/dev only; the modal may render for review but grants nothing untrusted.
- **Ratings/submission writes** and the **Verified badge's signing meaning** (Phase 3 review + Ed25519).
- **Backend (`node`) plugins** in the store (signed publishers only, RFC §6.2).

## Shared contracts other subsystems depend on (summary)
- **`PluginListingMeta`** + **`PLUGIN_CATEGORIES`** (`@alpine/plugin-sdk/manifest.ts`) — read by `apps/web` listing, in-shell Marketplace, CLI `pack` validator. Adds `marketplace?: PluginListingMeta` to `PluginManifest`; `readme` path is the user's "md that gets displayed."
- **`PluginLoadError` / `PluginErrorCode`** (`@alpine/plugin-sdk/errors.ts`) — produced by the loader, consumed by `pluginsPage.tsx` + CLI `validate`.
- **`PERMISSION_META`** (`@alpine/plugin-sdk/permissionMeta.ts`) — one source for docs, consent modal, and listing permission rows.
- **Constants** `PLUGIN_PERMISSIONS`, `PLUGIN_ID_PATTERN`, `SUPPORTED_API_VERSIONS`, `PLUGIN_API_VERSION`, `satisfiesRange` (`@alpine/plugin-sdk/constants.ts`) — imported by both the CJS main-process validator and the TS renderer/CLI (RFC §3.6 DRY fix).
- **Marketplace route table** (`apps/web`): `GET/POST /api/plugins/:id/downloads`, `GET/POST /api/plugins/:id/ratings`; deep link `alpine-shell://install-plugin?id=&version=` (focus-only, never auto-install).
- **R2 catalog layout** (RFC §8.2, reused as-is): `plugins/index.json`, `plugins/<id>/latest.json`, `plugins/<id>/<version>/<id>-<version>.alpineplugin`, `plugins/<id>/icon.png` — plus per-version `CHANGELOG.md` for MKT-6.

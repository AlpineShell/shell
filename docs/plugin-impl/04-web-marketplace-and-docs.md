# 04 — Web Marketplace Pages + Real Docs Site (`apps/web`)

> **Subsystem owner:** `apps/web` (Next.js 16 App Router, React 19, Tailwind 4).
> **Depends on (upstream):** the R2 catalog produced by `scripts/publishPlugin.js` (§8.2 of the RFC) and the on-disk manifest contract (§3). This doc **defines the catalog JSON shape** that publish tooling must emit and the permission-meta table that the desktop consent dialog (§4.9) shares.
> **Ships in:** RFC Phase 3 (marketplace) for `/plugins`; `/docs` can ship any time from Phase 0 onward since it is static content.
> **Trust model today:** curation only. The web surface is a *shop window + deep link*; it NEVER installs anything. The `alpine-shell://install-plugin` link only focuses the desktop Settings detail page — a real user click + the in-app consent modal are always required (RFC §4.9). This is a hard invariant, restated in §7 below.

---

## 0. What exists today in `apps/web`

- `src/app/layout.tsx` — root layout, fonts (`--font-geist-sans/mono`, `--font-averia`), `bg-[#050a1a] text-white`, `min-h-full flex flex-col` body.
- `src/app/page.tsx` — marketing home; uses `NavBar theme="light"`, `StarField`, `Footer`.
- `src/app/terms/page.tsx` — the **pattern to copy for a static content page**: `export const metadata`, a typed data array (`sections`), `<NavBar/> … <Footer/>` wrapper. No client JS.
- `src/app/components/{NavBar,Footer,StarField}.tsx` — `NavBar`/`Footer` take a `theme?: "light" | "dark"` prop. `NavBar` is `"use client"` (scroll listener); `Footer` is a server component.
- `globals.css` — Tailwind 4 via `@import "tailwindcss"`, `@theme inline` tokens.
- Deps: `next 16.2.9`, `react 19.2.4` only. **No markdown/MDX lib yet.** `next.config.ts` is empty.
- `AGENTS.md`: *"This is NOT the Next.js you know… read `node_modules/next/dist/docs/` before writing code."* — implementer must confirm App Router API details there before coding.

---

## 1. Markdown-rendering decision (load-bearing)

**Chosen approach: local `.md` files compiled to HTML at build time with a tiny pipeline (`react-markdown` + `remark-gfm`), rendered inside a shared `DocsLayout`. No MDX, no runtime fetch, no CMS.**

Rationale vs. alternatives:

| Option | Verdict |
|---|---|
| **`@next/mdx` (MDX pages)** | Rejected. Requires `next.config.ts` MDX plugin wiring + `mdx-components.tsx`; AGENTS.md warns Next 16 conventions differ from training data, so MDX config is the highest-risk-to-get-wrong path. MDX also lets doc content run JS — unnecessary for prose docs. |
| **`react-markdown` + `remark-gfm`** ✅ | Lowest dependency, no config surface, no build plugin. Docs authored as plain `.md` files imported as strings; rendered in a server component. GFM tables/autolinks/task-lists (needed for the manifest reference tables). Two small deps, both React-19-compatible. |
| **A hand-rolled md→html regex** | Rejected. The manifest reference needs tables + code fences + nested lists; hand-rolling is more code and more bugs than the two deps. |

**Concrete rendering contract** (`react-markdown` runs fine in a server component — it produces React elements, no client JS shipped for prose):

```tsx
// src/app/docs/_lib/Markdown.tsx  — server component
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ source }: { source: string }) {
  return (
    <div className="docs-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
```

Prose is styled with a `.docs-prose` block added to `globals.css` (headings, lists, tables, `code`/`pre`, links) — **not** `@tailwindcss/typography`, to keep deps to the two markdown packages and stay on Tailwind 4's `@import "tailwindcss"` with zero plugin config. Code fences render as styled `<pre>` (no syntax-highlight lib in v1; a later `rehype-highlight` opt-in is a clean add).

**Reading `.md` at build:** each doc route imports its markdown via a raw import so it is inlined into the server bundle (no `fs` at request time, works on static export/edge):

```ts
// next.config.ts — add a rule so *.md imports resolve to their raw string
const nextConfig: NextConfig = {
  turbopack: {
    rules: { "*.md": { loaders: ["raw-loader"], as: "*.js" } },
  },
};
```

> Implementer note: verify the exact Turbopack `rules` key against `node_modules/next/dist/docs/` (AGENTS.md). Fallback if raw-loader is awkward under Turbopack: read the file with `fs.readFileSync` inside the **server component** using `import.meta.dirname` + `path.join` (App Router server components may touch `fs`), which needs zero webpack/turbopack config. Pick one; the `fs.readFileSync` fallback is the safer default and is what the file tree below assumes.

New deps to add to `apps/web/package.json`:
```
react-markdown  ^9      remark-gfm  ^4
```

---

## 2. File tree (all new files)

```
apps/web/src/app/
  plugins/
    page.tsx                     # /plugins — server: fetch catalog index.json, render grid
    loading.tsx                  # skeleton grid
    error.tsx                    # "couldn't load the catalog" (client)
    _lib/
      catalog.ts                 # fetchCatalog(), fetchPluginDetail(id), types + zod-lite guards
      permissions.ts             # PERMISSION_META table (SHARED CONTRACT — see §6)
    _components/
      PluginCard.tsx             # logo, name, short desc, category badge
      CategoryFilter.tsx         # "use client" category pills (optional, Phase 3.1)
      PermissionRow.tsx          # one permission + rationale + risk badge
      RiskBadge.tsx              # colored badge by risk tier
      InstallButton.tsx          # "use client" — builds alpine-shell://install-plugin?id=&version=
      Screenshots.tsx            # "use client" lightbox-lite gallery (or static <img> grid in v1)
    [id]/
      page.tsx                   # /plugins/[id] — detail: logo, screenshots, README html,
                                 #   PERMISSIONS section, version/engines, Install button
      not-found.tsx              # unknown id
  docs/
    layout.tsx                   # DocsLayout: NavBar + sidebar nav + <main> content + Footer
    page.tsx                     # /docs → redirect to /docs/getting-started (or an index)
    _lib/
      nav.ts                     # DOCS_NAV: ordered [{ slug, title, group }] — SHARED w/ sidebar
      Markdown.tsx               # <Markdown source={...}/> (react-markdown + remark-gfm)
      loadDoc.ts                 # loadDoc(slug): reads content/<slug>.md via fs (server)
    _components/
      Sidebar.tsx                # "use client" — renders DOCS_NAV, highlights active slug
      DocShell.tsx               # server wrapper: <article><Markdown/></article> + prev/next
    content/
      getting-started.md
      manifest-reference.md
      contribution-surfaces.md
      sdk-api.md
      permissions-security.md
      publishing.md
    [slug]/
      page.tsx                   # /docs/[slug] — generateStaticParams over DOCS_NAV; renders md
```

Shared additions:
- `globals.css` — append `.docs-prose { … }` styles + risk-badge color utilities (or use Tailwind classes inline).
- `NavBar.tsx` — add real links: `Plugins` → `/plugins`, `Docs` → `/docs` (replace the dead `#` anchors). Small edit, listed in §8.

---

## 3. `/plugins` — catalog listing (server component)

### 3.1 Data source & fetch

`_lib/catalog.ts` fetches the R2 catalog. The base URL is an env var so dev/staging/prod differ:

```ts
// src/app/plugins/_lib/catalog.ts
const CATALOG_BASE =
  process.env.NEXT_PUBLIC_PLUGINS_BASE ?? "https://plugins.alpineshell.app";

export const CATALOG_INDEX_URL = `${CATALOG_BASE}/plugins/index.json`;
export const pluginDetailUrl = (id: string) =>
  `${CATALOG_BASE}/plugins/${id}/latest.json`;
export const pluginAssetUrl = (id: string, rel: string) =>
  `${CATALOG_BASE}/plugins/${id}/${rel}`;

export async function fetchCatalog(): Promise<CatalogIndex> {
  const res = await fetch(CATALOG_INDEX_URL, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return normalizeCatalog(await res.json());
}

export async function fetchPluginDetail(id: string): Promise<PluginDetail | null> {
  const res = await fetch(pluginDetailUrl(id), { next: { revalidate: 300 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`detail ${res.status}`);
  return normalizeDetail(await res.json());
}
```

- `next: { revalidate: 300 }` = ISR-style caching so a page build doesn't hammer R2 and the catalog stays ~5 min fresh. `/plugins` and `/plugins/[id]` are **server components** — the catalog fetch happens server-side, never in the browser (keeps R2 origin quiet, avoids CORS).
- `normalizeCatalog`/`normalizeDetail` are defensive guards (§6.4): drop entries missing `id`/`name`/`version`, coerce `permissions` to a known set, clamp string lengths. The catalog is a single-writer trust root today (RFC §8.3) but the web layer still validates shape so a malformed entry can't crash the page.

### 3.2 Page

```tsx
// src/app/plugins/page.tsx  (server component)
export const metadata = {
  title: "Plugins — Alpine Shell",
  description: "Extend your desktop. Browse Alpine Shell plugins.",
};

export default async function PluginsPage() {
  const catalog = await fetchCatalog();
  return (
    <main className="relative flex min-h-screen flex-col bg-[#050a1a] text-white">
      <NavBar theme="dark" />
      <section className="container mx-auto flex-1 px-8 pt-28 pb-16">
        <h1 className="font-averia text-4xl font-semibold">Plugins</h1>
        <p className="mt-2 text-gray-400">Widgets, tools and integrations for your topbar and desktop.</p>
        {/* optional CategoryFilter is client; grid stays server */}
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.plugins.map((p) => (
            <PluginCard key={p.id} plugin={p} />
          ))}
        </ul>
      </section>
      <Footer />
    </main>
  );
}
```

`PluginCard` (server): `<Link href={`/plugins/${p.id}`}>` wrapping the logo (`pluginAssetUrl(p.id, 'icon.png')` via `next/image` with `unoptimized` or a remotePatterns allow for the R2 host — see §8), `name`, one-line `shortDescription`, and a `category` badge. Uses the existing dark card styling vocabulary (`rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10`).

`loading.tsx` renders a 6-card skeleton grid; `error.tsx` (client, required by App Router for error boundaries) shows a retry.

---

## 4. `/plugins/[id]` — detail page

```tsx
// src/app/plugins/[id]/page.tsx  (server component)
export async function generateMetadata({ params }): Promise<Metadata> {
  const { id } = await params;                    // Next 16: params is a Promise
  const d = await fetchPluginDetail(id);
  return d
    ? { title: `${d.name} — Alpine Shell Plugins`, description: d.shortDescription }
    : { title: "Plugin not found" };
}

export default async function PluginDetailPage({ params }) {
  const { id } = await params;
  const d = await fetchPluginDetail(id);
  if (!d) notFound();                             // → not-found.tsx
  return ( /* layout below */ );
}
```

> **Next 16 note:** `params` (and `searchParams`) are Promises in App Router and must be awaited. Confirm in `node_modules/next/dist/docs/`.

**Detail layout, top → bottom:**

1. **Header** — logo (`next/image`), `name`, `author.name` (link to `author.url`), `version`, category badge, and the **Install button** (client, §7).
2. **Screenshots** — horizontal gallery from `d.screenshots[]` (each a `pluginAssetUrl`). v1 = static responsive `<img>` grid inside an `overflow-x-auto` rail; a lightbox is optional. Must scroll inside its own container (never widen the page).
3. **Long description / README** — `d.readme` markdown → `<Markdown source={d.readme} />` (reuses the docs `Markdown` component). This is the plugin's `README.md` shipped in the catalog as a string field (see §6.2).
4. **PERMISSIONS section** (the security-critical block, RFC §4.9) — heading "Permissions this plugin requests", then one `PermissionRow` per token in `d.permissions`, each rendering:
   - the human **label** + **rationale** from `PERMISSION_META` (§6.3),
   - a **`RiskBadge`** colored by `meta.risk` (`auto`=gray, `read`=blue, `control`=amber, `sensitive`=red, `node`=red/"backend"),
   - the plugin-supplied per-permission **reason string** if present (`d.permissionReasons?.[token]`), shown as "Why: …".
   - Below the list, a **data-flow line**: if the plugin has any `read:*` scope AND `network.connect` hosts, render "This plugin can send data it reads to: `api.example.com`" (mirrors the consent dialog's data-flow line). If `permissions` includes `node`, render a prominent "Runs a background process (requires a verified publisher)" callout.
5. **Compatibility** — `version`, `engines.alpineShell` range, `apiVersion`, size, last-updated. A small definition list.
6. **Footer meta** — repository/homepage/license links.

`not-found.tsx` renders a friendly "No plugin with id `<id>`" + link back to `/plugins`.

**`generateStaticParams`** for `[id]` is optional in Phase 3 — with `revalidate` the pages can be on-demand. If pre-rendering is wanted, `generateStaticParams` maps over `fetchCatalog().plugins` → `{ id }`.

---

## 5. `/docs` — real documentation site

### 5.1 Layout & navigation

`docs/layout.tsx` wraps every doc route in a persistent shell: top `NavBar theme="dark"`, then a two-column body — a **sticky sidebar** (`Sidebar`, client, highlights active slug via `usePathname`) and the `<main>` content column — then `Footer`. Content column max-width ~`prose` width; page never scrolls horizontally (code blocks scroll in their own `overflow-x-auto`).

```tsx
// src/app/docs/layout.tsx  (server)
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#050a1a] text-white">
      <NavBar theme="dark" />
      <div className="container mx-auto flex flex-1 gap-10 px-8 pt-24 pb-16">
        <Sidebar />                                {/* w-56 sticky top-24, hidden on mobile → drawer */}
        <main className="min-w-0 flex-1 max-w-3xl">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
```

### 5.2 The nav table (shared source of truth)

```ts
// src/app/docs/_lib/nav.ts
export type DocEntry = { slug: string; title: string; group: string };

export const DOCS_NAV: DocEntry[] = [
  { slug: "getting-started",       title: "Getting started · your first plugin", group: "Start here" },
  { slug: "manifest-reference",    title: "plugin.json manifest reference",       group: "Reference"  },
  { slug: "contribution-surfaces", title: "Contribution surfaces",                group: "Reference"  },
  { slug: "sdk-api",               title: "The @alpine/plugin-sdk API",           group: "Reference"  },
  { slug: "permissions-security",  title: "Permissions & the security model",     group: "Security"   },
  { slug: "publishing",            title: "Publishing to the marketplace",        group: "Ship it"    },
];
```

`Sidebar.tsx` groups `DOCS_NAV` by `group`, renders `<Link href={`/docs/${slug}`}>`, and bolds the active one (`usePathname()`). `DocShell` computes prev/next from array order for footer links.

### 5.3 The catch-all doc route

```tsx
// src/app/docs/[slug]/page.tsx  (server)
export function generateStaticParams() {
  return DOCS_NAV.map(({ slug }) => ({ slug }));   // fully static-generated
}
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const e = DOCS_NAV.find((d) => d.slug === slug);
  return { title: e ? `${e.title} — Alpine Shell Docs` : "Docs" };
}
export default async function DocPage({ params }) {
  const { slug } = await params;
  if (!DOCS_NAV.some((d) => d.slug === slug)) notFound();
  const source = await loadDoc(slug);              // reads content/<slug>.md
  return <DocShell slug={slug}><Markdown source={source} /></DocShell>;
}
```

```ts
// src/app/docs/_lib/loadDoc.ts  (server-only)
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function loadDoc(slug: string): Promise<string> {
  const file = path.join(process.cwd(), "src/app/docs/content", `${slug}.md`);
  return readFile(file, "utf8");
}
```

`docs/page.tsx` (the `/docs` index) `redirect("/docs/getting-started")` (or renders a short landing that links each group).

### 5.4 Doc content (authored `.md`, sourced from existing material)

Content is adapted from `apps/desktop/examples/plugins/README.md`, RFC §3/§4/§5/§7, and the SDK design. Each file is prose the implementer fills in; the required coverage:

| File | Must cover |
|---|---|
| `getting-started.md` | What a plugin is (self-describing folder), the `npm create alpine-plugin` 5-min path (RFC §7.3), the three load-bearing files, "runs in-process during dev = Tier A", the reload loop. |
| `manifest-reference.md` | Full field table from RFC §3.3 (`id` pattern, `version` semver, `apiVersion`, `engines`, `renderer`/`main`, `icon`, `contributes`, `permissions`, `optionalPermissions`, `network.connect`, metadata). The complete Weather example (§3.7). |
| `contribution-surfaces.md` | `topbarWidgets` / `desktopWidgets` / `settingsPages` / `launcherCommands` / `backendModules`, each with its fields (`export`, `slot`, `order`, `displayScope`, `since`), slot semantics, `PopupMenu` requirement for topbar overflow. |
| `sdk-api.md` | The `@alpine/plugin-sdk` export table (RFC §7.2): `usePluginSetting`, `usePluginState`, `usePluginBackendState`, `useShell`, theme hooks, `PopupMenu`, `alpinePluginPreset`. Note `h`/`window.alpine` legacy runtime for no-build plugins (today's shipped path, from examples README). |
| `permissions-security.md` | The permission tiers table (Auto/Read/Control/Sensitive/node/FORBIDDEN, RFC §4.7), the Tier A vs Tier B trust model, the FORBIDDEN class, "curated model today — only install plugins you trust", consent + JIT confirm. This page is the public face of the risk badges on `/plugins/[id]`. |
| `publishing.md` | `alpine plugin build && pack` → `.alpineplugin`, signing (Ed25519), submission (first-party/vetted only today), the catalog shape, the deep-link install flow. State the supply-chain honesty caveat (RFC §8.3). |

---

## 6. SHARED CONTRACTS (other subsystems depend on these)

### 6.1 Catalog index shape — `plugins/index.json`

The **publish pipeline (`scripts/publishPlugin.js`) MUST emit this**; the web layer consumes it. This is the authoritative wire schema for the listing:

```jsonc
// plugins/index.json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-08T00:00:00Z",
  "plugins": [
    {
      "id": "com.example.weather",          // reverse-DNS, matches folder/route
      "name": "Weather",
      "version": "0.1.0",                    // = latest published semver
      "shortDescription": "Current conditions in your topbar.",
      "category": "Topbar",                  // one of CATEGORIES (§6.5)
      "icon": "icon.png",                    // rel to plugins/<id>/  → pluginAssetUrl
      "author": { "name": "Example", "url": "https://example.dev" },
      "permissions": ["storage", "location:coarse", "net:fetch"],
      "verified": true,                      // signed/vetted publisher
      "apiVersion": 1,
      "engines": { "alpineShell": "^0.2.0" },
      "updatedAt": "2026-07-01T00:00:00Z"
    }
  ]
}
```

### 6.2 Detail shape — `plugins/<id>/latest.json`

Extends the R2 `latest.json` the installer already reads (RFC §8.2 has `{version, sha256, signature, size, url, engines}`); the marketplace **adds the presentational fields** so the web detail page needs one fetch:

```jsonc
// plugins/<id>/latest.json
{
  "id": "com.example.weather",
  "name": "Weather",
  "version": "0.1.0",
  "shortDescription": "Current conditions in your topbar.",
  "category": "Topbar",
  "icon": "icon.png",
  "screenshots": ["shots/1.png", "shots/2.png"],   // rel → pluginAssetUrl
  "readme": "# Weather\n\nShows…",                  // README.md contents, markdown string
  "author": { "name": "Example", "url": "https://example.dev" },
  "homepage": "https://example.dev",
  "repository": "https://github.com/example/weather",
  "license": "MIT",
  "permissions": ["storage", "location:coarse", "net:fetch"],
  "permissionReasons": {                            // optional per-token author rationale
    "location:coarse": "To show weather for your city.",
    "net:fetch": "To fetch the forecast from open-meteo."
  },
  "network": { "connect": ["https://api.open-meteo.com"] },
  "apiVersion": 1,
  "engines": { "alpineShell": "^0.2.0" },
  "verified": true,
  "size": 40213,
  "sha256": "…",           // installer fields, ignored by web
  "signature": "…",
  "url": "https://plugins.alpineshell.app/plugins/com.example.weather/0.1.0/com.example.weather-0.1.0.alpineplugin",
  "updatedAt": "2026-07-01T00:00:00Z"
}
```

**Contract for the publish pipeline:** roll `README.md` into `readme`, first-N screenshots into `screenshots[]`, and copy `permissions`/`network`/`engines`/`apiVersion` verbatim from `plugin.json`. `permissionReasons` is an optional new manifest field authors may add.

### 6.3 `PERMISSION_META` — shared with the desktop consent dialog

The web `PermissionRow`/`RiskBadge` and the desktop `pluginConsentDialog.tsx` (RFC §4.9) render from the **same table**. Define it once in the SDK (`@alpine/plugin-sdk`, since it's already the single source for `PLUGIN_PERMISSIONS`, RFC §3.6) and re-export; the web app imports it. Shape:

```ts
export type PermissionRisk = "auto" | "read" | "control" | "sensitive" | "node";
export interface PermissionMeta { label: string; description: string; risk: PermissionRisk }
export const PERMISSION_META: Record<PluginPermission, PermissionMeta>;
```

Example rows (aligned to RFC §4.7 tiers):

| token | label | risk |
|---|---|---|
| `storage` | "Store its own settings" | auto |
| `theme` / `clock` | "Read the topbar theme / clock" | auto |
| `read:volume` | "Read the system volume" | read |
| `net:fetch` | "Make network requests (to its allow-listed hosts)" | read |
| `location:coarse` | "Know your approximate location" | read |
| `control:volume` | "Change the system volume" | control |
| `control:wallpaper` | "Change your wallpaper" | control |
| `control:power` | "Shut down / restart the PC" | sensitive |
| `control:network` | "Connect to Wi-Fi networks" | sensitive |
| `launch:apps` | "Launch applications" | sensitive |
| `node` | "Run a background process (verified publishers only)" | node |

> **Fallback:** if a catalog entry lists a token not in `PERMISSION_META`, `PermissionRow` renders the raw token with an "unknown permission" red badge — never silently drops it (a security surface must fail loud).

### 6.4 Web-side validation guards

`normalizeCatalog`/`normalizeDetail` in `_lib/catalog.ts`: require `id` matches `PLUGIN_ID_PATTERN` (imported from SDK), `name`/`version` present, `permissions` is an array of strings, `readme` capped (e.g. 200 KB), URLs are `https:` before rendering as links. Drop/skip bad entries rather than throwing on the whole page.

### 6.5 Categories & the deep-link constant

```ts
export const CATEGORIES = ["Topbar", "Desktop", "Launcher", "Settings", "Utilities", "Fun"] as const;

// InstallButton builds exactly this (RFC §4.9 / §8.3):
export const installDeepLink = (id: string, version: string) =>
  `alpine-shell://install-plugin?id=${encodeURIComponent(id)}&version=${encodeURIComponent(version)}`;
```

`alpine-shell://install-plugin?id=<id>&version=<version>` — the desktop `second-instance` handler treats this as **"focus Settings on the marketplace detail page,"** never an auto-install. The web layer only produces the link; it makes no install claim.

---

## 7. `InstallButton` (the one client component that matters)

```tsx
// src/app/plugins/_components/InstallButton.tsx
"use client";
import { installDeepLink } from "../_lib/permissions"; // or wherever CATEGORIES/deep-link live

export function InstallButton({ id, version }: { id: string; version: string }) {
  return (
    <a
      href={installDeepLink(id, version)}
      className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2 font-averia text-black transition hover:bg-gray-200"
    >
      Install in Alpine Shell
    </a>
  );
}
```

- It is a plain `<a href="alpine-shell://…">`. The OS hands the URL to the desktop app's registered protocol handler. If Alpine Shell isn't installed, nothing happens (optionally show a "Don't have Alpine Shell? Download" secondary link below).
- **It never POSTs, never calls an API, never triggers a download.** The download + extract + verify + consent all happen inside the desktop app. Restated invariant (RFC §4.9): *a drive-by web page cannot install anything.*

---

## 8. Exact edits to existing files

| File | Edit |
|---|---|
| `apps/web/package.json` | add deps `react-markdown ^9`, `remark-gfm ^4`. |
| `apps/web/next.config.ts` | add `images.remotePatterns` for the R2 host (so `next/image` can load plugin logos/screenshots) **or** use `<img>`/`unoptimized` and skip this. Optionally the `turbopack.rules` for `*.md` (only if not using the `fs.readFile` approach — §1). |
| `apps/web/src/app/components/NavBar.tsx` | replace dead `#` anchors: add `Plugins`→`/plugins`, `Docs`→`/docs` (use `next/link`). |
| `apps/web/src/app/components/Footer.tsx` | add `Plugins`/`Docs` links in the footer nav (optional, mirrors NavBar). |
| `apps/web/src/app/globals.css` | append `.docs-prose { … }` (headings/lists/tables/pre/code/link styling) + risk-badge color classes if not done inline. |

Everything else in §2 is new files. No changes to `layout.tsx`, `page.tsx`, or `terms/`.

---

## 9. Rendering-surface summary (server vs client)

| Route/component | Kind | Why |
|---|---|---|
| `/plugins` page, `PluginCard` | **server** | catalog fetch stays server-side; no interactivity. |
| `/plugins/[id]` page, `Screenshots` (static grid), `PermissionRow`, `RiskBadge`, `Markdown` | **server** | prose + data render; `react-markdown` runs server-side, ships no client JS. |
| `InstallButton`, `CategoryFilter`, `Screenshots` (if lightbox), `error.tsx` | **client** | `href`/interactivity/error boundary. |
| `/docs/**` pages, `DocShell`, `Markdown`, `loadDoc` | **server** | static-generated via `generateStaticParams`; `.md` read at build. |
| `Sidebar` (docs) | **client** | `usePathname()` active-link highlight. |

Keep `react-markdown` on the server so no markdown engine ships to the browser. Only `usePathname`, the install `<a>`, and error boundaries are client.

---

## 10. Phasing & what stays gated

- **`/docs` — buildable now (Phase 0+).** Pure static content; no dependency on the marketplace. Ship early so plugin authors have a reference while the SDK lands.
- **`/plugins` + `/plugins/[id]` — Phase 3**, gated on `scripts/publishPlugin.js` emitting §6.1/§6.2 and the R2 bucket existing. Until then, `fetchCatalog` can point at a committed `public/plugins-sample/index.json` for local/preview.
- **Trust gate (permanent):** the web surface never installs, never runs plugin code, never signs anything. It renders catalog JSON and emits a consent-only deep link. All install/verify/consent logic is desktop-side (RFC §4.9). The **PERMISSIONS section is not decorative** — it must render every requested token with its risk badge, failing loud on unknown tokens, because it is a user's pre-install threat surface.

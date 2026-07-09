const CATALOG_BASE = (
  process.env.NEXT_PUBLIC_PLUGINS_BASE ??
  "https://pub-634a0706ca394cf7a0eedfa4f8a71a56.r2.dev"
).replace(/\/+$/, "");

const PLUGIN_ID_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const README_MAX_BYTES = 200_000;

export const CATALOG_INDEX_URL = `${CATALOG_BASE}/plugins/index.json`;
export const pluginDetailUrl = (id: string) =>
  `${CATALOG_BASE}/plugins/${id}/latest.json`;

export function resolveAssetUrl(id: string, rel: string | null | undefined): string | null {
  if (!rel || typeof rel !== "string") return null;
  if (/^https?:\/\//i.test(rel)) return rel.startsWith("https://") ? rel : null;
  const key = rel.startsWith("plugins/") ? rel : `plugins/${id}/${rel}`;
  return `${CATALOG_BASE}/${key.replace(/^\/+/, "")}`;
}

export interface PluginAuthor {
  name: string;
  url?: string;
}

export interface CatalogPlugin {
  id: string;
  name: string;
  version: string;
  shortDescription: string;
  category: string | null;
  iconUrl: string | null;
  author: PluginAuthor | null;
  permissions: string[];
  keywords: string[];
  apiVersion: number | null;
  engines: { alpineShell?: string } | null;
}

export interface CatalogIndex {
  schemaVersion: number;
  generatedAt: string | null;
  plugins: CatalogPlugin[];
}

export interface PluginScreenshot {
  src: string;
  caption?: string;
}

export interface PluginDetail extends CatalogPlugin {
  screenshots: PluginScreenshot[];
  readme: string | null;
  homepage: string | null;
  repository: string | null;
  license: string | null;
  permissionReasons: Record<string, string>;
  networkConnect: string[];
  size: number | null;
  updatedAt: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function httpsLink(v: unknown): string | null {
  const s = str(v);
  return s && s.startsWith("https://") ? s : null;
}

function normalizeAuthor(v: unknown): PluginAuthor | null {
  if (typeof v === "string") return v ? { name: v } : null;
  if (v && typeof v === "object") {
    const name = str((v as Record<string, unknown>).name);
    if (!name) return null;
    return { name, url: httpsLink((v as Record<string, unknown>).url) ?? undefined };
  }
  return null;
}

function normalizePermissions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is string => typeof p === "string");
}

function normalizeKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((k): k is string => typeof k === "string" && k.length > 0)
    .slice(0, 12);
}

function normalizeEngines(v: unknown): { alpineShell?: string } | null {
  if (!v || typeof v !== "object") return null;
  const alpineShell = str((v as Record<string, unknown>).alpineShell);
  return alpineShell ? { alpineShell } : null;
}

function iconField(raw: Record<string, unknown>): string | null {
  const id = String(raw.id ?? "");
  const rel = str(raw.iconUrl) ?? str(raw.icon) ?? str(raw.logo);
  if (rel && rel.startsWith("lucide:")) return null;
  return resolveAssetUrl(id, rel);
}

function normalizeEntry(raw: unknown): CatalogPlugin | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name);
  const version = str(r.version);
  if (!id || !PLUGIN_ID_PATTERN.test(id)) return null;
  if (!name || !version) return null;
  return {
    id,
    name,
    version,
    shortDescription: str(r.shortDescription) ?? str(r.description) ?? "",
    category: str(r.category),
    iconUrl: iconField(r),
    author: normalizeAuthor(r.author),
    permissions: normalizePermissions(r.permissions),
    keywords: normalizeKeywords(r.keywords),
    apiVersion: typeof r.apiVersion === "number" ? r.apiVersion : null,
    engines: normalizeEngines(r.engines),
  };
}

function normalizeCatalog(raw: unknown): CatalogIndex {
  const r = (raw ?? {}) as Record<string, unknown>;
  const plugins = Array.isArray(r.plugins) ? r.plugins : [];
  return {
    schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 1,
    generatedAt: str(r.generatedAt),
    plugins: plugins
      .map(normalizeEntry)
      .filter((p): p is CatalogPlugin => p !== null),
  };
}

function normalizeScreenshots(v: unknown, id: string): PluginScreenshot[] {
  if (!Array.isArray(v)) return [];
  const out: PluginScreenshot[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const src = resolveAssetUrl(id, item);
      if (src) out.push({ src });
    } else if (item && typeof item === "object") {
      const src = resolveAssetUrl(id, str((item as Record<string, unknown>).src));
      if (src) out.push({ src, caption: str((item as Record<string, unknown>).caption) ?? undefined });
    }
  }
  return out;
}

function normalizeReasons(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    const reason = str(value);
    if (reason) out[key] = reason;
  }
  return out;
}

function normalizeReadme(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.length > README_MAX_BYTES ? s.slice(0, README_MAX_BYTES) : s;
}

function normalizeConnect(v: unknown): string[] {
  const connect = (v as Record<string, unknown> | null | undefined)?.connect;
  if (!Array.isArray(connect)) return [];
  return connect.filter(
    (o): o is string => typeof o === "string" && o.startsWith("https://"),
  );
}

function normalizeDetail(raw: unknown): PluginDetail | null {
  const base = normalizeEntry(raw);
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  return {
    ...base,
    screenshots: normalizeScreenshots(r.screenshots, base.id),
    readme: normalizeReadme(r.readme),
    homepage: httpsLink(r.homepage),
    repository: httpsLink(r.repository),
    license: str(r.license),
    permissionReasons: normalizeReasons(r.permissionReasons ?? r.permissionRationale),
    networkConnect: normalizeConnect(r.network),
    size: typeof r.size === "number" ? r.size : null,
    updatedAt: str(r.updatedAt) ?? str(r.publishedAt),
  };
}

export async function fetchCatalog(): Promise<CatalogIndex> {
  let res: Response;
  try {
    res = await fetch(CATALOG_INDEX_URL, { next: { revalidate: 300 } });
  } catch {
    return { schemaVersion: 1, generatedAt: null, plugins: [] };
  }
  if (res.status === 404) return { schemaVersion: 1, generatedAt: null, plugins: [] };
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return normalizeCatalog(await res.json());
}

export async function fetchPluginDetail(id: string): Promise<PluginDetail | null> {
  if (!PLUGIN_ID_PATTERN.test(id)) return null;
  const res = await fetch(pluginDetailUrl(id), { next: { revalidate: 300 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`detail ${res.status}`);
  return normalizeDetail(await res.json());
}

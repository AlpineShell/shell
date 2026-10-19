import { TIER_GAP, deriveFields } from "../launcherSearch"
import { appResultKey, settingResultKey, tabResultKey } from "../launcherRanking"

export const WORD_BOUNDARY_SCORE = 2 * TIER_GAP
export const ALPINE_SETTINGS_TARGET = "alpine:settings"
export const QUICK_ACTIONS_PAGE: SettingsPageId = "quick-actions"

const KEYWORD_PENALTY = 2
const TAB_HOST_PENALTY = 6
const BOOKMARK_URL_PENALTY = 6
const BOOKMARK_LIMIT = 2000
const ALPINE_SETTINGS_KEYWORDS = ["settings", "preferences", "options", "config", "alpine"]

const BROWSER_LABELS: Record<string, string> = {
  chrome: "Chrome",
  msedge: "Edge",
  firefox: "Firefox",
  brave: "Brave",
  opera: "Opera",
  vivaldi: "Vivaldi",
}

function term(text: string, penalty = 0, minScore = 0): LauncherSearchTerm {
  return { text, penalty, minScore }
}

function keywordTerm(keyword: string): LauncherSearchTerm {
  return term(keyword, KEYWORD_PENALTY)
}

function sentence(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => !!part && part.trim().length > 0).join(". ")
}

export function browserLabel(browser: string): string {
  return BROWSER_LABELS[browser] ?? browser
}

export function alpineSettingsItem(): LauncherItem {
  return { id: -1, name: "Settings", lnkPath: null, target: ALPINE_SETTINGS_TARGET, icon: null }
}

export function isAlpineSettingsItem(item: LauncherItem): boolean {
  return item.target === ALPINE_SETTINGS_TARGET
}

export function appEntry(item: LauncherItem): LauncherEntry {
  const fields = deriveFields(item)
  const key = appResultKey(item.target)
  const extraTerms = isAlpineSettingsItem(item) ? ALPINE_SETTINGS_KEYWORDS.map(keywordTerm) : []
  return {
    kind: "app",
    id: `app:${appResultKey(item.lnkPath ?? item.target)}`,
    rankKey: key,
    section: "apps",
    title: item.name,
    subtitle: "",
    fields,
    terms: extraTerms,
    semanticText: sentence([item.name, fields.aliases.join(", "), item.description]),
    item,
  }
}

export function appEntries(items: LauncherItem[]): LauncherEntry[] {
  return [...items, alpineSettingsItem()].map(appEntry)
}

function installedAppLookup(apps: LauncherEntry[]) {
  const byKey = new Map<string, LauncherEntry>()
  const byName = new Map<string, LauncherEntry>()
  for (const entry of apps) {
    if (entry.kind !== "app") continue
    byKey.set(entry.rankKey, entry)
    if (!byName.has(entry.title.toLowerCase())) byName.set(entry.title.toLowerCase(), entry)
  }
  return (app: OpenApp) => byKey.get(appResultKey(app.path)) ?? byName.get(app.name.toLowerCase()) ?? null
}

export function windowEntries(openApps: OpenApp[], apps: LauncherEntry[]): LauncherEntry[] {
  const installedFor = installedAppLookup(apps)
  return openApps.map((app) => {
    const installed = installedFor(app)
    const launchItem = installed && installed.kind === "app" ? installed.item : null
    const titleTerms = app.title && app.title !== app.name ? [term(app.title, 0, WORD_BOUNDARY_SCORE)] : []
    return {
      kind: "window",
      id: `window:${app.hwnd}`,
      rankKey: installed ? installed.rankKey : appResultKey(app.path),
      section: "windows",
      title: app.name,
      subtitle: app.title,
      fields: installed ? installed.fields : deriveFields({ name: app.name, target: app.path }),
      terms: titleTerms,
      semanticText: null,
      app,
      launchItem,
    }
  })
}

export function tabEntries(tabs: BrowserTab[], meta: ReadonlyMap<string, BrowserTabMeta>, openApps: OpenApp[]): LauncherEntry[] {
  const iconByWindow = new Map(openApps.map((app) => [app.hwnd, app.icon]))
  return tabs.map((tab) => {
    const known = meta.get(`${tab.hwnd}:${tab.index}`)
    const host = known?.host ?? tab.host ?? null
    const terms = [term(tab.title, 0, WORD_BOUNDARY_SCORE)]
    if (host) terms.push(term(host, TAB_HOST_PENALTY, WORD_BOUNDARY_SCORE))
    return {
      kind: "tab",
      id: `tab:${tab.hwnd}:${tab.index}`,
      rankKey: tabResultKey(host, tab.title),
      section: "windows",
      title: tab.title,
      subtitle: `${host ? `${host} · ` : ""}${browserLabel(tab.browser)} tab`,
      fields: null,
      terms,
      semanticText: null,
      tab,
      host,
      favicon: known?.favicon ?? tab.favicon ?? null,
      windowIcon: iconByWindow.get(tab.hwnd) ?? null,
    }
  })
}

export function bookmarkEntries(bookmarks: Bookmark[]): LauncherEntry[] {
  return bookmarks.slice(0, BOOKMARK_LIMIT).map((bookmark) => ({
    kind: "bookmark",
    id: `bookmark:${bookmark.url}`,
    rankKey: appResultKey(bookmark.url),
    section: "bookmarks",
    title: bookmark.title,
    subtitle: bookmark.url,
    fields: deriveFields({ name: bookmark.title, target: "" }),
    terms: [term(bookmark.url, BOOKMARK_URL_PENALTY)],
    semanticText: null,
    bookmark,
  }))
}

export function settingEntries(settings: readonly SettingsEntry[], hintFor: (setting: SettingsEntry) => string): LauncherEntry[] {
  return settings.map((setting) => ({
    kind: "setting",
    id: `setting:${setting.id}`,
    rankKey: settingResultKey(setting.id),
    section: setting.page === QUICK_ACTIONS_PAGE ? "commands" : "settings",
    title: setting.label,
    subtitle: hintFor(setting),
    fields: null,
    terms: [term(setting.label), ...setting.keywords.map(keywordTerm)],
    semanticText: sentence([setting.label, setting.description, setting.keywords.join(", ")]),
    setting,
  }))
}

export function commandEntries(commands: readonly LauncherCommand[]): LauncherEntry[] {
  return commands.map((command) => ({
    kind: "command",
    id: `command:${command.id}`,
    rankKey: command.rankKey,
    section: "commands",
    title: command.label,
    subtitle: "",
    fields: null,
    terms: [term(command.label), ...command.keywords.map(keywordTerm)],
    semanticText: sentence([command.label, command.keywords.join(", ")]),
    command,
  }))
}

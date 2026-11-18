import { SETTINGS_PAGES, SETTINGS_SECTIONS } from './registry'

const PLUGIN_PAGES_SECTION: SettingsSectionId = 'plugins'

function isTopLevelRoute(route: string | null): route is string {
  return route !== null && !route.includes('/')
}

function registryItems(section: SettingsSectionId): SettingsSidebarItem[] {
  return SETTINGS_PAGES.filter((page) => page.section === section && isTopLevelRoute(page.route))
    .sort((a, b) => a.order - b.order)
    .map((page) => ({ kind: 'page', route: page.route as string, page }))
}

function pluginItems(section: SettingsSectionId, pluginPages: PluginSettingsPageEntry[]): SettingsSidebarItem[] {
  if (section !== PLUGIN_PAGES_SECTION) return []
  return pluginPages.filter((page) => page.topLevel).map((page) => ({ kind: 'plugin-page', route: page.route, page }))
}

export function settingsSidebarSections(pluginPages: PluginSettingsPageEntry[]): SettingsSidebarSection[] {
  return [...SETTINGS_SECTIONS]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({ section, items: [...registryItems(section.id), ...pluginItems(section.id, pluginPages)] }))
    .filter((sidebarSection) => sidebarSection.items.length > 0)
}

export function showsAsGroup(sidebarSection: SettingsSidebarSection): boolean {
  return sidebarSection.section.sidebar === 'group' && sidebarSection.items.length > 1
}

export function sidebarItemLabel(item: SettingsSidebarItem, grouped: boolean): string {
  if (item.kind === 'page' && grouped) return item.page.groupLabel ?? item.page.label
  return item.page.label
}

export function groupHoldingRoute(route: string | null, sidebar: SettingsSidebarSection[]): SettingsSectionId | null {
  if (route === null) return null
  const holder = sidebar.find((sidebarSection) => showsAsGroup(sidebarSection) && sidebarSection.items.some((item) => item.route === route))
  return holder ? holder.section.id : null
}

import { pluginAssetUrl, pluginLogoUrl, pluginRendererEntry } from './pluginAssets'

const PLUGIN_SETTINGS_ROUTE_PREFIX = 'plugins/'

export function pluginSettingDeclarations(record: PluginRecord): PluginSettingDeclaration[] {
  const settings = record.contributes?.settings
  return Array.isArray(settings) ? (settings as PluginSettingDeclaration[]) : []
}

function declaredSettingsPage(record: PluginRecord): PluginSettingsPageDeclaration | null {
  const pages = record.contributes?.settingsPages
  return Array.isArray(pages) && pages.length > 0 ? (pages[0] as PluginSettingsPageDeclaration) : null
}

export function pluginSettingsRoute(pluginId: string): string {
  return `${PLUGIN_SETTINGS_ROUTE_PREFIX}${pluginId}`
}

export function pluginIdFromSettingsRoute(route: string): string | null {
  if (!route.startsWith(PLUGIN_SETTINGS_ROUTE_PREFIX)) return null
  const pluginId = route.slice(PLUGIN_SETTINGS_ROUTE_PREFIX.length)
  return pluginId && !pluginId.includes('/') ? pluginId : null
}

function pageIconUrl(record: PluginRecord, page: PluginSettingsPageDeclaration | null): string | null {
  return pluginAssetUrl(record.id, page?.icon) ?? pluginLogoUrl(record)
}

export function pluginSettingsPage(record: PluginRecord): PluginSettingsPageEntry | null {
  if (record.loadable === false) return null
  const page = declaredSettingsPage(record)
  const settings = pluginSettingDeclarations(record)
  if (!page && settings.length === 0) return null
  return {
    pluginId: record.id,
    pluginName: record.name,
    route: pluginSettingsRoute(record.id),
    label: page?.label ?? record.name,
    iconUrl: pageIconUrl(record, page),
    topLevel: page?.topLevel === true,
    exportName: page?.export ?? null,
    entry: pluginRendererEntry(record),
    enabled: record.enabled !== false,
    settings,
  }
}

export function pluginSettingsPages(records: PluginRecord[]): PluginSettingsPageEntry[] {
  return records.flatMap((record) => {
    const page = pluginSettingsPage(record)
    return page ? [page] : []
  })
}

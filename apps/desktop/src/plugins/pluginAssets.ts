const DEFAULT_RENDERER_ENTRY = 'index.js'

export function pluginAssetUrl(id: string, rel?: string | null): string | null {
  if (!rel || rel.startsWith('lucide:')) return null
  if (/^https?:\/\//i.test(rel)) return rel
  return `alpine-plugin://${id}/${rel}`
}

export function pluginLogoUrl(plugin: PluginRecord): string | null {
  return pluginAssetUrl(plugin.id, plugin.marketplace?.logo || plugin.icon)
}

export function pluginRendererEntry(plugin: PluginRecord): string {
  return plugin.renderer || plugin.entry || DEFAULT_RENDERER_ENTRY
}

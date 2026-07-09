import { clearWidgets, registerContribution } from './pluginRegistry'
import { installPluginRuntime } from './pluginRuntime'

let version = 0

interface ManifestTopbarWidget {
  export?: string
  slot?: TopbarSlot
  order?: number
}

function mountTopbarWidgets(plugin: PluginRecord, module: Record<string, unknown>) {
  const widgets = (plugin.contributes?.topbarWidgets ?? []) as ManifestTopbarWidget[]
  for (const widget of widgets) {
    const exportName = widget.export || 'default'
    const component = module[exportName] ?? module.default
    if (typeof component !== 'function') {
      console.error(`[plugins] "${plugin.id}": renderer has no component export "${exportName}"`)
      continue
    }
    registerContribution({
      type: 'topbar-widget',
      id: `${plugin.id}:${exportName}`,
      component: component as import('react').ComponentType,
      slot: widget.slot,
      order: widget.order,
    })
  }
}

export async function loadTopbarPlugins() {
  installPluginRuntime()
  clearWidgets()
  version += 1
  let list: PluginRecord[] = []
  try {
    list = await window.plugins.list()
  } catch (err) {
    console.error('[plugins] list failed:', err)
    return
  }
  await Promise.all(
    list.map(async (plugin) => {
      if (plugin.enabled === false || plugin.loadable === false) return
      const entry = plugin.renderer || plugin.entry || 'index.js'
      const url = `alpine-plugin://${plugin.id}/${entry}?v=${version}`
      try {
        const module = (await import(/* @vite-ignore */ url)) as Record<string, unknown>
        mountTopbarWidgets(plugin, module)
      } catch (err) {
        console.error(`[plugins] failed to load "${plugin.id}":`, err)
      }
    }),
  )
}

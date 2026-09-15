import type { ComponentType } from 'react'
import { clearWidgets, registerContribution } from './pluginRegistry'
import { installPluginRuntime } from './pluginRuntime'
import { pluginRendererEntry } from './pluginAssets'
import { pluginSettingDeclarations } from './pluginSettingsPages'
import { readPluginSettings } from './pluginSettingsStore'

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
      component: component as ComponentType,
      slot: widget.slot,
      order: widget.order,
    })
  }
}

function importPluginModule(pluginId: string, entry: string): Promise<Record<string, unknown>> {
  const url = `alpine-plugin://${pluginId}/${entry}?v=${version}`
  return import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>
}

function primePluginSettings(plugin: PluginRecord): Promise<unknown> {
  if (pluginSettingDeclarations(plugin).length === 0) return Promise.resolve()
  return readPluginSettings(plugin.id).catch(() => null)
}

export function renewPluginModules() {
  version += 1
}

export async function loadTopbarPlugins() {
  installPluginRuntime()
  clearWidgets()
  renewPluginModules()
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
      try {
        await primePluginSettings(plugin)
        const module = await importPluginModule(plugin.id, pluginRendererEntry(plugin))
        mountTopbarWidgets(plugin, module)
      } catch (err) {
        console.error(`[plugins] failed to load "${plugin.id}":`, err)
      }
    }),
  )
}

export async function loadPluginComponent(pluginId: string, entry: string, exportName: string): Promise<ComponentType | null> {
  installPluginRuntime()
  try {
    await readPluginSettings(pluginId).catch(() => null)
    const module = await importPluginModule(pluginId, entry)
    const component = module[exportName]
    if (typeof component === 'function') return component as ComponentType
    console.error(`[plugins] "${pluginId}": renderer has no component export "${exportName}"`)
  } catch (err) {
    console.error(`[plugins] failed to load "${pluginId}":`, err)
  }
  return null
}

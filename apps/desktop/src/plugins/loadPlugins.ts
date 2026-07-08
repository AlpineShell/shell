import { clearWidgets } from './pluginRegistry'
import { installPluginRuntime } from './pluginRuntime'

let version = 0

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
        await import(/* @vite-ignore */ url)
      } catch (err) {
        console.error(`[plugins] failed to load "${plugin.id}":`, err)
      }
    }),
  )
}

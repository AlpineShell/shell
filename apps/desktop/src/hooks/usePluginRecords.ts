import { useShellState } from './useShellState'

function subscribeToPluginReloads(callback: (records: PluginRecord[] | null) => void): () => void {
  return window.plugins.onReload(() => {
    window.plugins.list().then(callback).catch(() => {})
  })
}

export function usePluginRecords(): PluginRecord[] | null {
  return useShellState<PluginRecord[] | null>(null, window.plugins.list, subscribeToPluginReloads)
}

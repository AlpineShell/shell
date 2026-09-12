import { useMemo } from 'react'
import { pluginWidgetPlaceholders } from '../components/settings/ridge/ridgePluginWidgets'
import { useShellState } from './useShellState'

function subscribeToPluginReloads(callback: (records: PluginRecord[]) => void): () => void {
  return window.plugins.onReload(() => {
    window.plugins.list().then(callback).catch(() => {})
  })
}

export function useRidgePluginWidgets(): Record<RidgePluginSlot, RidgePluginWidget[]> {
  const records = useShellState<PluginRecord[]>([], window.plugins.list, subscribeToPluginReloads)
  return useMemo(
    () => ({ left: pluginWidgetPlaceholders(records, 'left'), right: pluginWidgetPlaceholders(records, 'right') }),
    [records]
  )
}

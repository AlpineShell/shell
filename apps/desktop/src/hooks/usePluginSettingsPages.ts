import { useMemo } from 'react'
import { pluginSettingsPages } from '../plugins/pluginSettingsPages'
import { usePluginRecords } from './usePluginRecords'

export function usePluginSettingsPages(): PluginSettingsPageEntry[] | null {
  const records = usePluginRecords()
  return useMemo(() => (records === null ? null : pluginSettingsPages(records)), [records])
}

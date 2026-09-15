import { useMemo } from 'react'
import { pluginWidgetPlaceholders } from '../components/settings/ridge/ridgePluginWidgets'
import { usePluginRecords } from './usePluginRecords'

const NO_RECORDS: PluginRecord[] = []

export function useRidgePluginWidgets(): Record<RidgePluginSlot, RidgePluginWidget[]> {
  const records = usePluginRecords() ?? NO_RECORDS
  return useMemo(
    () => ({ left: pluginWidgetPlaceholders(records, 'left'), right: pluginWidgetPlaceholders(records, 'right') }),
    [records]
  )
}

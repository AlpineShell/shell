import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  pluginSettingsSnapshot,
  readPluginSettings,
  subscribePluginSettings,
  writePluginSetting,
} from '../plugins/pluginSettingsStore'

export function usePluginSetting<T extends PluginSettingValue = PluginSettingValue>(
  pluginId: string,
  key: string
): [T, (value: T) => void] {
  const values = useSyncExternalStore(subscribePluginSettings, () => pluginSettingsSnapshot(pluginId))

  useEffect(() => {
    if (pluginSettingsSnapshot(pluginId) === undefined) readPluginSettings(pluginId).catch(() => {})
  }, [pluginId])

  const setValue = useCallback(
    (value: T) => {
      void writePluginSetting(pluginId, key, value)
    },
    [pluginId, key]
  )

  return [values?.[key] as T, setValue]
}

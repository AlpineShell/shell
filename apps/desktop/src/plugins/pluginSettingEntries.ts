import { Puzzle } from 'lucide-react'
import { isValidPluginSettingValue } from '@alpine/plugin-sdk'
import {
  onPluginSettingsChanged,
  pluginSettingsSnapshot,
  readPluginSettings,
  writePluginSetting,
} from './pluginSettingsStore'

const DEFAULT_SLIDER_STEP = 1

const entriesByDeclaration = new Map<string, SettingsValueEntry>()

function pluginSettingControl(setting: PluginSettingDeclaration): SettingsValueControl {
  if (setting.type === 'toggle') return { kind: 'toggle' }
  if (setting.type === 'select') {
    return { kind: 'select', options: setting.options.map((option) => ({ value: option.value, label: option.label })) }
  }
  return { kind: 'slider', min: setting.min, max: setting.max, step: setting.step ?? DEFAULT_SLIDER_STEP, unit: setting.unit }
}

function currentValue(setting: PluginSettingDeclaration, values: PluginSettingValues | undefined): SettingsValue {
  const value = values?.[setting.key]
  return isValidPluginSettingValue(setting, value) ? value : setting.default
}

function refuseFailedWrite(result: PluginSettingWriteResult) {
  if (!result.ok) throw new Error(result.error)
}

function createPluginSettingEntry(pluginId: string, setting: PluginSettingDeclaration): SettingsValueEntry {
  return {
    id: `plugin-${pluginId}-${setting.key}`,
    label: setting.label,
    description: setting.info ?? '',
    keywords: [],
    icon: Puzzle,
    page: 'plugins',
    group: pluginId,
    order: 0,
    applies: 'instant',
    control: pluginSettingControl(setting),
    defaultValue: setting.default,
    initial: () => currentValue(setting, pluginSettingsSnapshot(pluginId)),
    read: () => readPluginSettings(pluginId).then((values) => currentValue(setting, values)),
    write: (value) => writePluginSetting(pluginId, setting.key, value as PluginSettingValue).then(refuseFailedWrite),
    subscribe: (listener) => onPluginSettingsChanged(pluginId, (values) => listener(currentValue(setting, values))),
    validate: (value) => (isValidPluginSettingValue(setting, value) ? value : setting.default),
  }
}

export function pluginSettingEntry(pluginId: string, setting: PluginSettingDeclaration): SettingsValueEntry {
  const cacheKey = JSON.stringify([pluginId, setting])
  const known = entriesByDeclaration.get(cacheKey)
  if (known) return known
  const entry = createPluginSettingEntry(pluginId, setting)
  entriesByDeclaration.set(cacheKey, entry)
  return entry
}

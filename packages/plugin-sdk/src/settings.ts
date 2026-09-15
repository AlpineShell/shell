import type { PluginSettingValue } from './contributions'

export type PluginSettingValues = Record<string, PluginSettingValue>

export type PluginSettingChangeListener = (key: string, value: PluginSettingValue) => void

export type PluginSettingState<T extends PluginSettingValue = PluginSettingValue> = [T, (value: T) => void]

export interface PluginBackendSettings {
  get<T extends PluginSettingValue = PluginSettingValue>(key: string): T | undefined
  onChange(listener: PluginSettingChangeListener): () => void
}

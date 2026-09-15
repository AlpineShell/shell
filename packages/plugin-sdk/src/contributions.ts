import type { PLUGIN_SETTING_TYPES } from './constants'

export type TopbarSlot = 'left' | 'center' | 'right'
export type DisplayScope = 'primary' | 'all'

interface BaseContribution {
  export?: string
  since?: number
}

export interface TopbarWidgetContribution extends BaseContribution {
  slot: TopbarSlot
  order?: number
  displayScope?: DisplayScope
}

export interface SettingsPageContribution extends BaseContribution {
  label: string
  icon?: string
  path?: string
  topLevel?: boolean
}

export interface LauncherCommandContribution extends BaseContribution {
  kind: 'action' | 'provider'
  title?: string
  keywords?: string[]
}

export interface BackendModuleContribution extends BaseContribution {}

export type PluginSettingType = (typeof PLUGIN_SETTING_TYPES)[number]

export type PluginSettingValue = boolean | string | number

export interface PluginSettingOption {
  value: string
  label: string
}

interface BasePluginSetting {
  key: string
  label: string
  info?: string
  since?: number
}

export interface PluginToggleSetting extends BasePluginSetting {
  type: 'toggle'
  default: boolean
}

export interface PluginSelectSetting extends BasePluginSetting {
  type: 'select'
  default: string
  options: PluginSettingOption[]
}

export interface PluginSliderSetting extends BasePluginSetting {
  type: 'slider'
  default: number
  min: number
  max: number
  step?: number
  unit?: string
}

export type PluginSettingContribution = PluginToggleSetting | PluginSelectSetting | PluginSliderSetting

export interface PluginContributions {
  topbarWidgets?: TopbarWidgetContribution[]
  settings?: PluginSettingContribution[]
  settingsPages?: SettingsPageContribution[]
  launcherCommands?: LauncherCommandContribution[]
  backendModules?: BackendModuleContribution[]
}

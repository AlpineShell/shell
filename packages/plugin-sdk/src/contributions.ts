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

export interface PluginContributions {
  topbarWidgets?: TopbarWidgetContribution[]
  settingsPages?: SettingsPageContribution[]
  launcherCommands?: LauncherCommandContribution[]
  backendModules?: BackendModuleContribution[]
}

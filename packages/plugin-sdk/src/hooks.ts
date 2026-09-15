import { getHost, hostReact } from './host'
import type { PluginSettingValue } from './contributions'
import type { PluginSettingState } from './settings'

export function usePluginData<T>(channel: string, initial: T): T {
  return getHost().usePluginData<T>(channel, initial)
}

export const useDarkText = (): boolean => getHost().useDarkText()
export const useTopbarBg = (): string => getHost().useTopbarBg()

export const useTopbarTheme = (): { dark: boolean; bg: string } => {
  const host = getHost()
  return host.useTopbarTheme ? host.useTopbarTheme() : { dark: host.useDarkText(), bg: host.useTopbarBg() }
}

export function usePluginSetting<T extends PluginSettingValue = PluginSettingValue>(pluginId: string, key: string): PluginSettingState<T> {
  const host = getHost()
  if (!host.usePluginSetting) throw new Error('[alpine-plugin-sdk] this Alpine Shell has no plugin settings')
  return host.usePluginSetting<T>(pluginId, key)
}

export function useShell(): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return getHost().shell || {}
}

export function PopupMenu(props: unknown): unknown {
  const host = getHost()
  const R = hostReact()
  return (R.createElement as (...a: unknown[]) => unknown)(host.PopupMenu, props)
}

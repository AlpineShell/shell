import type { PluginSettingValue } from './contributions'
import type { PluginSettingState } from './settings'

export type AlpineHtml = (strings: TemplateStringsArray, ...values: unknown[]) => import('react').ReactNode

export interface AlpineHostStore {
  createStore: (...args: unknown[]) => unknown
  useStore: (...args: unknown[]) => unknown
  useShallow: (...args: unknown[]) => unknown
}

export interface AlpineHost {
  react: typeof import('react')
  reactDom?: typeof import('react-dom')
  jsxRuntime?: { jsx: unknown; jsxs: unknown; Fragment: unknown }
  html?: AlpineHtml
  store?: AlpineHostStore
  useDarkText(): boolean
  useTopbarBg(): string
  useTopbarTheme?(): { dark: boolean; bg: string }
  usePluginData<T>(channel: string, initial: T): T
  usePluginSetting?<T extends PluginSettingValue = PluginSettingValue>(pluginId: string, key: string): PluginSettingState<T>
  shell?: Record<string, (...args: unknown[]) => Promise<unknown>>
  PopupMenu: unknown
  React?: typeof import('react')
}

export function getHost(): AlpineHost {
  const w = globalThis as unknown as { alpine?: AlpineHost; alpinePlugin?: { host?: AlpineHost } }
  const host = w.alpinePlugin?.host || w.alpine
  if (!host) throw new Error('[alpine-plugin-sdk] host bridge missing (window.alpine not published)')
  return host
}

export function hostReact(): typeof import('react') {
  const h = getHost()
  const r = h.react || h.React
  if (!r) throw new Error('[alpine-plugin-sdk] host React missing')
  return r
}

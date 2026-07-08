import { getHost, hostReact } from './host'

export function usePluginData<T>(channel: string, initial: T): T {
  return getHost().usePluginData<T>(channel, initial)
}

export const useDarkText = (): boolean => getHost().useDarkText()
export const useTopbarBg = (): string => getHost().useTopbarBg()

export const useTopbarTheme = (): { dark: boolean; bg: string } => {
  const host = getHost()
  return host.useTopbarTheme ? host.useTopbarTheme() : { dark: host.useDarkText(), bg: host.useTopbarBg() }
}

export function usePluginSetting<T>(key: string, def: T): [T, (v: T) => void] {
  const host = getHost()
  const R = hostReact()
  const [value, setValue] = R.useState<T>(def)
  R.useEffect(() => {
    let alive = true
    if (host.getSetting) host.getSetting<T>(key, def).then((v) => { if (alive) setValue(v) }).catch(() => {})
    return () => {
      alive = false
    }
  }, [key])
  const set = (v: T) => {
    setValue(v)
    if (host.setSetting) void host.setSetting<T>(key, v)
  }
  return [value, set]
}

export function useShell(): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return getHost().shell || {}
}

export function PopupMenu(props: unknown): unknown {
  const host = getHost()
  const R = hostReact()
  return (R.createElement as (...a: unknown[]) => unknown)(host.PopupMenu, props)
}

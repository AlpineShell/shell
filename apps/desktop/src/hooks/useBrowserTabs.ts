import { useEffect, useState } from 'react'

export function useBrowserTabs(enabled: boolean): BrowserTab[] {
  const [tabs, setTabs] = useState<BrowserTab[]>([])

  useEffect(() => {
    if (!enabled) {
      setTabs((prev) => (prev.length > 0 ? [] : prev))
      return
    }
    let alive = true
    const apply = (data: BrowserTab[]) => { if (alive && data.length > 0) setTabs(data) }
    window.shell.browserTabs.list().then(apply).catch(() => {})
    const unsubscribe = window.shell.browserTabs.onChanged(apply)
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [enabled])

  return tabs
}

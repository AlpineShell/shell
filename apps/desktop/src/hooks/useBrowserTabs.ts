import { useEffect, useState } from 'react'

export function tabFaviconKey(tab: BrowserTab): string {
  return `${tab.hwnd}:${tab.index}`
}

export function useBrowserTabs(enabled: boolean): { tabs: BrowserTab[]; favicons: Map<string, string> } {
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [favicons, setFavicons] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!enabled) {
      setTabs((prev) => (prev.length > 0 ? [] : prev))
      setFavicons((prev) => (prev.size > 0 ? new Map() : prev))
      return
    }
    let alive = true
    window.shell.browserTabs
      .list()
      .then((data) => { if (alive && data.length > 0) setTabs(data) })
      .catch(() => {})
    const unsubscribe = window.shell.browserTabs.onChanged((data) => {
      if (!alive) return
      const next = new Map<string, string>()
      for (const tab of data) {
        if (tab.favicon) next.set(tabFaviconKey(tab), tab.favicon)
      }
      if (next.size > 0) setFavicons(next)
    })
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [enabled])

  return { tabs, favicons }
}

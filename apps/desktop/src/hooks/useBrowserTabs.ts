import { useEffect, useState } from 'react'

export function tabKey(tab: BrowserTab): string {
  return `${tab.hwnd}:${tab.index}`
}

export function useBrowserTabs(enabled: boolean): { tabs: BrowserTab[]; meta: Map<string, BrowserTabMeta> } {
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [meta, setMeta] = useState<Map<string, BrowserTabMeta>>(new Map())

  useEffect(() => {
    if (!enabled) {
      setTabs((prev) => (prev.length > 0 ? [] : prev))
      setMeta((prev) => (prev.size > 0 ? new Map() : prev))
      return
    }
    let alive = true
    window.shell.browserTabs
      .list()
      .then((data) => { if (alive && data.length > 0) setTabs(data) })
      .catch(() => {})
    const unsubscribe = window.shell.browserTabs.onChanged((data) => {
      if (!alive) return
      const next = new Map<string, BrowserTabMeta>()
      for (const tab of data) {
        if (tab.favicon || tab.host) next.set(tabKey(tab), { favicon: tab.favicon, host: tab.host })
      }
      if (next.size > 0) setMeta(next)
    })
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [enabled])

  return { tabs, meta }
}

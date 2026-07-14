import { useEffect, useState } from 'react'

export function useBrowserTabs(enabled: boolean): BrowserTab[] {
  const [tabs, setTabs] = useState<BrowserTab[]>([])

  useEffect(() => {
    if (!enabled) {
      setTabs((prev) => (prev.length > 0 ? [] : prev))
      return
    }
    let alive = true
    window.shell.browserTabs
      .list()
      .then((data) => { if (alive && data.length > 0) setTabs(data) })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled])

  return tabs
}

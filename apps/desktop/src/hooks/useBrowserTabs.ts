import { useEffect, useState } from 'react'

export function useBrowserTabs(enabled: boolean): BrowserTab[] {
  const [tabs, setTabs] = useState<BrowserTab[]>([])

  useEffect(() => {
    if (!enabled) {
      setTabs([])
      return
    }
    let alive = true
    window.shell.browserTabs
      .list()
      .then((data) => { if (alive) setTabs(data) })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled])

  return tabs
}

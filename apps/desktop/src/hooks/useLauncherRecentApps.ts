import { useEffect, useState } from 'react'

let cache = false

export function useLauncherRecentApps() {
  const [enabled, setEnabled] = useState(cache)

  useEffect(() => {
    let alive = true
    const apply = (value: boolean) => { cache = value; if (alive) setEnabled(value) }
    window.launcher.recentApps().then(apply).catch(() => {})
    const off = window.launcher.onRecentAppsChanged(apply)
    return () => { alive = false; off() }
  }, [])

  return enabled
}

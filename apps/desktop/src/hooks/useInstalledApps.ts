import { useEffect, useState } from 'react'

let cache: InstalledApp[] = []

export function useInstalledApps() {
  const [state, setState] = useState<InstalledApp[]>(cache)

  useEffect(() => {
    let alive = true
    const apply = (data: InstalledApp[]) => { cache = data; if (alive) setState(data) }
    window.shell.apps.installed().then(apply)
    window.shell.apps.onInstalledChanged(apply)
    return () => { alive = false }
  }, [])

  return state
}

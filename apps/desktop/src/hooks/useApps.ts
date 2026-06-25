import { useEffect, useState } from 'react'

let cache: LauncherItem[] = []

export function useApps() {
  const [apps, setApps] = useState<LauncherItem[]>(cache)

  useEffect(() => {
    let alive = true
    const apply = (data: LauncherItem[]) => { cache = data; if (alive) setApps(data) }
    window.shell.apps.catalog().then(apply)
    const offCatalog = window.shell.apps.onCatalogChanged(apply)
    return () => { alive = false; offCatalog() }
  }, [])

  return apps
}

import { useEffect, useState } from 'react'

let cache: StartupEntry[] = []

export function useStartupApps() {
  const [state, setState] = useState<StartupEntry[]>(cache)

  useEffect(() => {
    let alive = true
    const apply = (data: StartupEntry[]) => { cache = data; if (alive) setState(data) }
    window.shell.apps.startup().then(apply)
    window.shell.apps.onStartupChanged(apply)
    return () => { alive = false }
  }, [])

  return state
}

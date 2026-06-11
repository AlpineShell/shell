import { useEffect, useState } from 'react'

let cache: RunningApp[] = []

export function useRunningApps(pollMs = 4000) {
  const [apps, setApps] = useState<RunningApp[]>(cache)

  useEffect(() => {
    let alive = true
    const tick = () => window.shell.apps.running().then((data) => { cache = data; if (alive) setApps(data) })
    tick()
    const id = setInterval(tick, pollMs)
    return () => { alive = false; clearInterval(id) }
  }, [pollMs])

  return apps
}

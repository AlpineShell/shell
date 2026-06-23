import { useEffect, useState } from 'react'

const DEFAULT_MAX_RESULTS = 8

let cache = DEFAULT_MAX_RESULTS

export function useLauncherMaxResults() {
  const [maxResults, setMaxResults] = useState(cache)

  useEffect(() => {
    let alive = true
    const apply = (value: number) => { cache = value; if (alive) setMaxResults(value) }
    window.launcher.maxResults().then(apply).catch(() => {})
    const off = window.launcher.onMaxResultsChanged(apply)
    return () => { alive = false; off() }
  }, [])

  return maxResults
}

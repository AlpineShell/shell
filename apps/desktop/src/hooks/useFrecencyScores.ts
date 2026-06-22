import { useEffect, useState } from 'react'

let cache: Record<string, number> = {}

export function useFrecencyScores() {
  const [scores, setScores] = useState<Record<string, number>>(cache)

  useEffect(() => {
    let alive = true
    const apply = (data: Record<string, number>) => { cache = data; if (alive) setScores(data) }
    window.launcher.scores().then(apply).catch(() => {})
    const off = window.launcher.onScoresChanged(apply)
    return () => { alive = false; off() }
  }, [])

  return scores
}

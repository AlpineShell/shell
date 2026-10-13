import { useEffect, useState } from 'react'

const RESOLVE_DEBOUNCE_MS = 90
const MIN_QUERY_LENGTH = 2

export function useRunCommand(query: string): RunResult | null {
  const [resolved, setResolved] = useState<{ query: string; result: RunResult | null }>({ query: '', result: null })
  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH || !window.shell.run) return
    let alive = true
    const timer = setTimeout(() => {
      window.shell.run
        .resolve(trimmed)
        .then((result) => { if (alive) setResolved({ query: trimmed, result }) })
        .catch(() => { if (alive) setResolved({ query: trimmed, result: null }) })
    }, RESOLVE_DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [trimmed])

  return resolved.query === trimmed ? resolved.result : null
}

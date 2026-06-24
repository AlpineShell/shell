import { useEffect, useState } from 'react'

export function useShellState<T>(
  initialValue: T,
  fetch: () => Promise<T>,
  subscribe: (callback: (data: T) => void) => (() => void) | void
): T {
  const [state, setState] = useState<T>(initialValue)

  useEffect(() => {
    let alive = true
    const apply = (data: T) => { if (alive) setState(data) }
    fetch().then(apply).catch(() => {})
    const unsubscribe = subscribe(apply)
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

  return state
}

import { useEffect, useState } from 'react'

const lastKnownByChannel = new Map<unknown, unknown>()

export function useShellState<T>(
  initialValue: T,
  fetch: () => Promise<T>,
  subscribe: (callback: (data: T) => void) => (() => void) | void
): T {
  const [state, setState] = useState<T>(() =>
    lastKnownByChannel.has(fetch) ? (lastKnownByChannel.get(fetch) as T) : initialValue
  )

  useEffect(() => {
    let alive = true
    const apply = (data: T) => {
      lastKnownByChannel.set(fetch, data)
      if (alive) setState(data)
    }
    fetch().then(apply).catch(() => {})
    const unsubscribe = subscribe(apply)
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

  return state
}

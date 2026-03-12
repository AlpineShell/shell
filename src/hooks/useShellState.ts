import { useEffect, useState } from 'react'

export function useShellState<T>(
  initialValue: T,
  fetch: () => Promise<T>,
  subscribe: (callback: (data: T) => void) => void
): T {
  const [state, setState] = useState<T>(initialValue)

  useEffect(() => {
    fetch().then(setState)
    subscribe(setState)
  }, [])

  return state
}

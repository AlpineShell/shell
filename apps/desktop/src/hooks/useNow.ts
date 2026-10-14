import { useEffect, useState } from 'react'

export function useNow(running: boolean, intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [running, intervalMs])

  return now
}

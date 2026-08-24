import { useEffect, useState } from 'react'

const MINUTE_MS = 60_000
const BOUNDARY_GUARD_MS = 20

function delayToNextMinute(epochMs: number): number {
  return MINUTE_MS - (epochMs % MINUTE_MS) + BOUNDARY_GUARD_MS
}

export function useMinuteTick(): Date {
  const [minute, setMinute] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setMinute(new Date())
      timer = setTimeout(tick, delayToNextMinute(Date.now()))
    }
    const resync = () => {
      clearTimeout(timer)
      tick()
    }
    timer = setTimeout(tick, delayToNextMinute(Date.now()))
    document.addEventListener('visibilitychange', resync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [])

  return minute
}

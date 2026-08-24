import { useEffect, useState } from 'react'

const MINUTE_MS = 60_000
const BOUNDARY_GUARD_MS = 20

function delayToNextMinute(epochMs: number): number {
  return MINUTE_MS - (epochMs % MINUTE_MS) + BOUNDARY_GUARD_MS
}

function rendersIdentically(current: Date, next: Date): boolean {
  return Math.floor(current.getTime() / MINUTE_MS) === Math.floor(next.getTime() / MINUTE_MS)
    && current.getTimezoneOffset() === next.getTimezoneOffset()
}

export function useMinuteTick(): Date {
  const [minute, setMinute] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const publish = () => {
      const next = new Date()
      setMinute((current) => (rendersIdentically(current, next) ? current : next))
    }
    const tick = () => {
      publish()
      timer = setTimeout(tick, delayToNextMinute(Date.now()))
    }
    const resync = () => {
      clearTimeout(timer)
      tick()
    }
    timer = setTimeout(tick, delayToNextMinute(Date.now()))
    const unsubscribeResume = window.shell?.system?.onResume?.(resync)
    return () => {
      clearTimeout(timer)
      unsubscribeResume?.()
    }
  }, [])

  return minute
}

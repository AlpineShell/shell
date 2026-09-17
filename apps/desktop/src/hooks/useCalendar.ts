import { useEffect, useState } from 'react'

const DEFAULT_STATE: CalendarConnection = {
  connected: false,
  email: null,
  connecting: false,
  error: null,
}

export function useCalendar() {
  const [state, setState] = useState<CalendarConnection>(DEFAULT_STATE)

  useEffect(() => {
    window.shell?.calendar?.state?.()?.then?.(setState)
    return window.shell?.calendar?.onStateChanged?.(setState)
  }, [])

  return {
    state,
    connect: () => window.shell?.calendar?.connect?.(),
    disconnect: () => window.shell?.calendar?.disconnect?.(),
    refresh: (range?: CalendarRange) => window.shell?.calendar?.refresh?.(range),
  }
}

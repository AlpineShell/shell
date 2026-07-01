import { useEffect, useState } from 'react'

const DEFAULT_STATE: CalendarConnection = {
  connected: false,
  email: null,
  hasCredentials: false,
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
    setCredentials: (clientId: string, clientSecret: string) => window.shell?.calendar?.setCredentials?.(clientId, clientSecret),
    refresh: (range?: CalendarRange) => window.shell?.calendar?.refresh?.(range),
  }
}

import { useEffect, useState } from 'react'

const DEFAULT_PREFS: ClockPrefs = {
  timeFormat: 'auto',
  systemTimeFormat: '24h',
  calendarDays: 1,
  showTasks: true,
}

export function useClockPrefs() {
  const [prefs, setPrefsState] = useState<ClockPrefs>(window.shell?.clock?.initial ?? DEFAULT_PREFS)

  useEffect(() => {
    window.shell?.clock?.prefs?.()?.then?.(setPrefsState)
    return window.shell?.clock?.onPrefsChanged?.(setPrefsState)
  }, [])

  return { prefs }
}

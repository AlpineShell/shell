import { useEffect, useState } from 'react'

export function useMonitors() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])

  useEffect(() => {
    window.shell.system.getMonitors().then(setMonitors)
    return window.shell.system.onMonitorsChanged(setMonitors)
  }, [])

  const setBrightness = (id: string, value: number) => {
    setMonitors(prev =>
      prev.map(m => (m.id === id ? { ...m, brightness: value } : m))
    )
    window.shell.system.setMonitorBrightness(id, value)
  }

  return { monitors, setBrightness }
}

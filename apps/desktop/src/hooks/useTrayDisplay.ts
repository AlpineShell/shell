import { useEffect, useState } from 'react'

export function useTrayDisplay() {
  const [display, setDisplay] = useState<TrayDisplaySetting>({ showOnAllMonitors: false, primaryDisplayId: 0 })

  useEffect(() => {
    window.shell?.tray?.display?.()?.then?.(setDisplay)
    window.shell?.tray?.onDisplayChanged?.(setDisplay)
  }, [])

  const setShowOnAllMonitors = (value: boolean) => {
    setDisplay((d) => ({ ...d, showOnAllMonitors: value }))
    window.shell?.tray?.setDisplay?.(value)
  }

  return { display, setShowOnAllMonitors }
}

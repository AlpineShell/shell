import { useEffect, useState } from 'react'

export function useTraySettings() {
  const [settings, setSettingsState] = useState<TraySettings>({ enabled: true, showOverflow: true })

  useEffect(() => {
    window.shell?.tray?.settings?.()?.then?.(setSettingsState)
    window.shell?.tray?.onSettingsChanged?.(setSettingsState)
  }, [])

  return { settings }
}

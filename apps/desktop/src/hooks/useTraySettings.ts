import { useEffect, useState } from 'react'

export function useTraySettings() {
  const [settings, setSettingsState] = useState<TraySettings>({ enabled: true, showOverflow: true })

  useEffect(() => {
    window.shell?.tray?.settings?.()?.then?.(setSettingsState)
    window.shell?.tray?.onSettingsChanged?.(setSettingsState)
  }, [])

  const setSettings = (partial: Partial<TraySettings>) => {
    setSettingsState((s) => ({ ...s, ...partial }))
    window.shell?.tray?.setSettings?.(partial)
  }

  return { settings, setSettings }
}

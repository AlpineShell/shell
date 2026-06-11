import { useEffect, useState } from 'react'

export function useTrayIcons() {
  const [icons, setIcons] = useState<TrayIcon[]>([])

  useEffect(() => {
    window.shell?.tray?.icons?.()?.then?.(setIcons)
    window.shell?.tray?.onIconsChanged?.(setIcons)
  }, [])

  return icons
}

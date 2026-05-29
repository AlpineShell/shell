import { useEffect, useState } from 'react'

export function useTrayLayout() {
  const [layout, setLayoutState] = useState<TrayLayout>({ order: [], hidden: [] })

  useEffect(() => {
    window.shell?.tray?.layout?.()?.then?.(setLayoutState)
    window.shell?.tray?.onLayoutChanged?.(setLayoutState)
  }, [])

  const setLayout = (next: TrayLayout) => {
    setLayoutState(next)
    window.shell?.tray?.setLayout?.(next)
  }

  return { layout, setLayout }
}

import { useEffect, useState } from 'react'

const EMPTY_TRAY_LAYOUT: TrayLayout = { order: [], hidden: [] }

export function useTrayLayout() {
  const [layout, setLayoutState] = useState<TrayLayout>(EMPTY_TRAY_LAYOUT)

  useEffect(() => {
    let alive = true
    const apply = (next: TrayLayout) => {
      if (alive) setLayoutState(next)
    }
    window.shell.tray.layout().then(apply).catch(() => {})
    const unsubscribe = window.shell.tray.onLayoutChanged(apply)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const setLayout = (next: TrayLayout) => {
    setLayoutState(next)
    window.shell.tray.setLayout(next)
  }

  return { layout, setLayout }
}

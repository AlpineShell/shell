import { useEffect, useState } from 'react'

export function useDisplays() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  useEffect(() => {
    window.shell.system.getDisplays().then(setDisplays)
    return window.shell.system.onDisplaysChanged(setDisplays)
  }, [])
  return displays
}

import { useEffect, useState } from 'react'

const FALLBACK_HOTKEY = 'Win'

export function useLauncherHotkey() {
  const [hotkey, setHotkey] = useState(FALLBACK_HOTKEY)
  const [defaultHotkey, setDefaultHotkey] = useState(FALLBACK_HOTKEY)

  useEffect(() => {
    window.launcher.getHotkey().then(setHotkey)
    window.launcher.defaultHotkey().then(setDefaultHotkey)
    window.launcher.onHotkeyChanged(setHotkey)
  }, [])

  async function setHotkeyTo(next: string) {
    setHotkey(await window.launcher.setHotkey(next))
  }

  return { hotkey, defaultHotkey, setHotkey: setHotkeyTo }
}

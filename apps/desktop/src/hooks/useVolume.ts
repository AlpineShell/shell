import { useEffect, useState } from 'react'

export function useVolume() {
  const [volume, setVolume] = useState(50)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    window.shell.system.volume().then(setVolume)
    window.shell.system.mute().then(setMuted)
    window.shell.system.onVolumeChanged(setVolume)
    window.shell.system.onMuteChanged(setMuted)
  }, [])

  const set = (value: number) => {
    setVolume(value)
    window.shell.system.setVolume(value)
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    window.shell.system.setMute(next)
  }

  return { volume, setVolume: set, muted, toggleMute }
}

import { useEffect, useState } from 'react'

export function useVolume() {
  const [volume, setVolume] = useState(50)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    let alive = true
    const applyVolume = (value: number) => { if (alive) setVolume(value) }
    const applyMuted = (value: boolean) => { if (alive) setMuted(value) }
    window.shell.system.volume().then(applyVolume)
    window.shell.system.mute().then(applyMuted)
    const unsubscribeVolume = window.shell.system.onVolumeChanged(applyVolume)
    const unsubscribeMuted = window.shell.system.onMuteChanged(applyMuted)
    return () => {
      alive = false
      unsubscribeVolume()
      unsubscribeMuted()
    }
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

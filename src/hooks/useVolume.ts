import { useEffect, useState } from 'react'

export function useVolume() {
  const [volume, setVolume] = useState(50)

  useEffect(() => {
    window.shell.system.volume().then(setVolume)
    window.shell.system.onVolumeChanged(setVolume)
  }, [])

  const set = (value: number) => {
    setVolume(value)
    window.shell.system.setVolume(value)
  }

  return [volume, set] as const
}

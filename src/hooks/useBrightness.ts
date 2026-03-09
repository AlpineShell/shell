import { useEffect, useState } from 'react'

export function useBrightness() {
  const [brightness, setBrightness] = useState(50)

  useEffect(() => {
    window.shell.system.brightness().then(setBrightness)
    window.shell.system.onBrightnessChanged(setBrightness)
  }, [])

  const set = (value: number) => {
    setBrightness(value)
    window.shell.system.setBrightness(value)
  }

  return [brightness, set] as const
}

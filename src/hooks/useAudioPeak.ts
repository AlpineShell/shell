import { useEffect, useRef, useState } from 'react'

export function useAudioPeak(enabled: boolean) {
  const [peak, setPeak] = useState(0)
  const subscribed = useRef(false)

  useEffect(() => {
    if (!enabled) {
      if (subscribed.current) {
        window.shell.system.unsubscribePeak()
        subscribed.current = false
      }
      setPeak(0)
      return
    }

    window.shell.system.subscribePeak()
    subscribed.current = true
    window.shell.system.onAudioPeak(setPeak)

    return () => {
      if (subscribed.current) {
        window.shell.system.unsubscribePeak()
        subscribed.current = false
      }
    }
  }, [enabled])

  return peak
}

import { useEffect, useState } from 'react'

export const VOLUME_FEEDBACK_SHOWN_MS = 1500

export function useVolumeFeedback(): MediaFaceVolume {
  const [volume, setVolume] = useState(100)
  const [muted, setMuted] = useState(false)
  const [showing, setShowing] = useState(false)

  useEffect(() => {
    let alive = true
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let knownVolume: number | null = null
    let knownMuted: boolean | null = null

    const showForAWhile = () => {
      setShowing(true)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        if (alive) setShowing(false)
      }, VOLUME_FEEDBACK_SHOWN_MS)
    }

    const learnVolume = (value: number, pushed: boolean) => {
      if (!alive) return
      const changed = knownVolume !== null && knownVolume !== value
      knownVolume = value
      setVolume(value)
      if (pushed && changed) showForAWhile()
    }

    const learnMuted = (value: boolean, pushed: boolean) => {
      if (!alive) return
      const changed = knownMuted !== null && knownMuted !== value
      knownMuted = value
      setMuted(value)
      if (pushed && changed) showForAWhile()
    }

    window.shell.system.volume().then((value) => learnVolume(value, false))
    window.shell.system.mute().then((value) => learnMuted(value, false))
    const removeVolumeListener = window.shell.system.onVolumeChanged((value) => learnVolume(value, true))
    const removeMuteListener = window.shell.system.onMuteChanged((value) => learnMuted(value, true))

    return () => {
      alive = false
      clearTimeout(hideTimer)
      removeVolumeListener()
      removeMuteListener()
    }
  }, [])

  return { level: muted ? 0 : volume / 100, showing }
}

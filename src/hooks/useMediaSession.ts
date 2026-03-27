import { useEffect, useState, useCallback } from 'react'

const initialState: MediaPlayback = { title: null, artist: null, appName: null, appIcon: null, playing: false, thumbnail: null, thumbnailType: null }

export function useMediaSession() {
  const [state, setState] = useState<MediaPlayback>(initialState)

  useEffect(() => {
    window.shell.media.session().then(setState)
    window.shell.media.onSessionChanged(setState)
  }, [])

  const control = useCallback((action: 'toggle' | 'next' | 'previous') => {
    if (action === 'toggle') {
      setState((prev) => ({ ...prev, playing: !prev.playing }))
    }
    window.shell.media.control(action)
  }, [])

  const update = useCallback((data: MediaPlayback) => setState(data), [])

  return { ...state, control, update }
}

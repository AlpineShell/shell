import { useEffect, useState, useCallback } from 'react'

const initialState: MediaPlayback = { title: null, artist: null, playing: false, thumbnail: null, thumbnailType: null }

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

  return { ...state, control }
}

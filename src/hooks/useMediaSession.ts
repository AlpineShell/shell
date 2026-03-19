import { useShellState } from './useShellState'

export function useMediaSession() {
  return useShellState<MediaPlayback>(
    { title: null, artist: null, playing: false },
    window.shell.media.session,
    window.shell.media.onSessionChanged
  )
}

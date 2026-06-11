import { useShellState } from './useShellState'

export function useMicrophone() {
  return useShellState<MicrophoneStatus>(
    { active: false, apps: [] },
    window.shell.media.microphone,
    window.shell.media.onMicrophoneChanged
  )
}

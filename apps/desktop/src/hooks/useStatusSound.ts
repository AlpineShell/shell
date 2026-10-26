import { useShellState } from './useShellState'

export function useStatusSound() {
  return useShellState<boolean>(false, window.topbar.statusSound, window.topbar.onStatusSoundChanged)
}

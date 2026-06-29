import { useShellState } from './useShellState'

export function useDisplays() {
  return useShellState<DisplayInfo[]>([], window.shell.system.getDisplays, window.shell.system.onDisplaysChanged)
}

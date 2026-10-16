import { useShellState } from './useShellState'

export function useDesktopsOnlyWithSeveral() {
  return useShellState<boolean>(
    false,
    window.shell.desktops.onlyWithSeveral,
    window.shell.desktops.onOnlyWithSeveralChanged
  )
}

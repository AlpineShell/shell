import { useShellState } from './useShellState'

export function useDesktopsOnlyWithSeveral() {
  return useShellState<boolean>(
    true,
    window.shell.desktops.onlyWithSeveral,
    window.shell.desktops.onOnlyWithSeveralChanged
  )
}

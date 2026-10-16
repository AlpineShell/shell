import { useShellState } from './useShellState'

export function useVirtualDesktops() {
  return useShellState<VirtualDesktopsState>(
    { count: 1, current: 0 },
    window.shell.desktops.state,
    window.shell.desktops.onChanged
  )
}

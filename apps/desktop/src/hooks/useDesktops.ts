import { useShellState } from './useShellState'

const SINGLE_DESKTOP: VirtualDesktopsState = {
  currentId: 'desktop-1',
  canCreate: true,
  desktops: [{ id: 'desktop-1', name: 'Desktop 1', windowCount: 0, windows: [] }],
}

export function useDesktops(): VirtualDesktopsState {
  return useShellState(SINGLE_DESKTOP, window.shell.desktops.state, window.shell.desktops.onChanged)
}

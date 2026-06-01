import { useShellState } from './useShellState'

export function useWindowsUpdate() {
  const state = useShellState<WindowsUpdateState>(
    { status: 'idle', updates: [], lastCheckedAt: null, error: null },
    window.shell.windowsUpdate.getState,
    window.shell.windowsUpdate.onStateChanged
  )

  return {
    state,
    check: window.shell.windowsUpdate.check,
    openSettings: window.shell.windowsUpdate.openSettings,
  }
}

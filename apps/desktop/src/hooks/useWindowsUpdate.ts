import { useShellState } from './useShellState'

export function useWindowsUpdate() {
  const state = useShellState<WindowsUpdateState>(
    { status: 'idle', updates: [], lastCheckedAt: null, rebootRequired: false, progressPercent: 0, progressLabel: null, installingId: null, error: null },
    window.shell.windowsUpdate.getState,
    window.shell.windowsUpdate.onStateChanged
  )

  return {
    state,
    check: window.shell.windowsUpdate.check,
    install: window.shell.windowsUpdate.install,
    openWindowsUpdate: window.shell.windowsUpdate.openWindowsUpdate,
  }
}

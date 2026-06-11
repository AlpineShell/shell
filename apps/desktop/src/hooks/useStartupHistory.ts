import { useShellState } from './useShellState'

export function useStartupHistory() {
  return useShellState<StartupHistoryEntry[]>(
    [],
    window.shell.apps.history,
    window.shell.apps.onStartupHistoryChanged
  )
}

import { useShellState } from './useShellState'

export function useOpenApps() {
  return useShellState<OpenApp[]>(
    [],
    window.shell.windows.openApps,
    window.shell.windows.onOpenAppsChanged
  )
}

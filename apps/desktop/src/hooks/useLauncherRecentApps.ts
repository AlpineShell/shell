import { useShellState } from './useShellState'

export function useLauncherRecentApps() {
  return useShellState(false, window.launcher.recentApps, window.launcher.onRecentAppsChanged)
}

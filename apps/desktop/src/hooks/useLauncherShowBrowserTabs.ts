import { useShellState } from './useShellState'

export function useLauncherShowBrowserTabs() {
  return useShellState(true, window.launcher.showBrowserTabs, window.launcher.onShowBrowserTabsChanged)
}

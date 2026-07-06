import { useShellState } from './useShellState'

export function useLauncherShowBookmarks() {
  return useShellState(true, window.launcher.showBookmarks, window.launcher.onShowBookmarksChanged)
}

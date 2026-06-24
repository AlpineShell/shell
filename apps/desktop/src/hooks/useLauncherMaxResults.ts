import { useShellState } from './useShellState'

const DEFAULT_MAX_RESULTS = 8

export function useLauncherMaxResults() {
  return useShellState(DEFAULT_MAX_RESULTS, window.launcher.maxResults, window.launcher.onMaxResultsChanged)
}

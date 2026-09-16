import { useShellState } from './useShellState'
import { EMPTY_LAUNCHER_MEMORY } from '../lib/launcherRanking'

export function useLauncherMemory(): LauncherMemory {
  return useShellState<LauncherMemory>(EMPTY_LAUNCHER_MEMORY, window.launcher.scores, window.launcher.onScoresChanged)
}

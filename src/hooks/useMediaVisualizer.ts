import { useShellState } from './useShellState'

export function useMediaVisualizer() {
  return useShellState<boolean>(false, window.topbar.mediaVisualizer, window.topbar.onMediaVisualizerChanged)
}

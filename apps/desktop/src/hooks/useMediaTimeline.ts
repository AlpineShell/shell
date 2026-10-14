import { useShellState } from './useShellState'

export function useMediaTimeline() {
  return useShellState<MediaTimeline | null>(null, window.shell.media.timeline, window.shell.media.onTimelineChanged)
}

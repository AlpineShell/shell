export function mediaElapsedMs(timeline: MediaTimeline, now: number) {
  const sinceMeasured = timeline.playing && timeline.updatedAt > 0 ? Math.max(0, now - timeline.updatedAt) : 0
  return Math.min(timeline.durationMs, timeline.positionMs + sinceMeasured)
}

export function formatMediaTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

export function positionAtPointer(clientX: number, left: number, width: number, durationMs: number) {
  if (width <= 0) return 0
  const fraction = Math.min(1, Math.max(0, (clientX - left) / width))
  return Math.round(fraction * durationMs)
}

function timelineOf(info) {
  const durationMs = Number(info?.durationMs) || 0
  if (!info?.title || durationMs <= 0) return null
  return {
    positionMs: Math.max(0, Math.min(durationMs, Number(info.positionMs) || 0)),
    durationMs,
    updatedAt: Number(info.timelineUpdatedAt) || 0,
    playing: !!info.playing,
    canSeek: !!info.canSeek,
  }
}

function timelineChanged(previous, next) {
  if (!previous || !next) return previous !== next
  return previous.updatedAt !== next.updatedAt
    || previous.durationMs !== next.durationMs
    || previous.positionMs !== next.positionMs
    || previous.playing !== next.playing
    || previous.canSeek !== next.canSeek
}

function seekTarget(timeline, positionMs) {
  if (!timeline?.canSeek || !Number.isFinite(positionMs)) return null
  return Math.round(Math.max(0, Math.min(timeline.durationMs, positionMs)))
}

function seekTimeline(timeline, positionMs, now) {
  return { ...timeline, positionMs, updatedAt: now }
}

function settleTimeline(shown, measured, seekBase) {
  const appStillReportsOldPosition = seekBase !== null
    && !!shown
    && !!measured
    && measured.updatedAt === seekBase
    && measured.durationMs === shown.durationMs
    && measured.playing === shown.playing
  return appStillReportsOldPosition ? { timeline: shown, seekBase } : { timeline: measured, seekBase: null }
}

module.exports = { timelineOf, timelineChanged, seekTarget, seekTimeline, settleTimeline }

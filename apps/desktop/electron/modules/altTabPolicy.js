const THUMBNAIL_STALE_MS = 30000

function initialSelection(windowCount, pendingSteps) {
  if (windowCount <= 0) return 0
  const start = windowCount > 1 ? 1 : 0
  return (((start + pendingSteps) % windowCount) + windowCount) % windowCount
}

function planSwitcherAfterBuild({ isLatestBuild, windowCount, altHeld, pendingSteps }) {
  if (!isLatestBuild || windowCount === 0) return { action: 'drop' }
  const index = initialSelection(windowCount, pendingSteps)
  return { action: altHeld ? 'show' : 'switch', index }
}

function isThumbnailStale(entry, now, maxAgeMs = THUMBNAIL_STALE_MS) {
  return !entry || now - entry.ts >= maxAgeMs
}

module.exports = {
  THUMBNAIL_STALE_MS,
  initialSelection,
  planSwitcherAfterBuild,
  isThumbnailStale,
}

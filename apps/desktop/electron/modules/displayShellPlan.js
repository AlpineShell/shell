function sameBounds(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function displayMoved(shellDisplay, currentDisplay) {
  return !sameBounds(shellDisplay.bounds, currentDisplay.bounds) || shellDisplay.scaleFactor !== currentDisplay.scaleFactor
}

function planDisplayShells(shellDisplays, currentDisplays) {
  const currentIds = new Set(currentDisplays.map((display) => display.id))
  const shellDisplaysById = new Map(shellDisplays.map((display) => [display.id, display]))
  return {
    stale: shellDisplays.filter((display) => !currentIds.has(display.id)).map((display) => display.id),
    missing: currentDisplays.filter((display) => !shellDisplaysById.has(display.id)),
    moved: currentDisplays.filter((display) => shellDisplaysById.has(display.id) && displayMoved(shellDisplaysById.get(display.id), display)),
  }
}

function planChangesShells(plan) {
  return plan.stale.length > 0 || plan.missing.length > 0 || plan.moved.length > 0
}

const PLACEMENT_TOLERANCE_DIP = 2

function within(a, b) {
  return Math.abs(a - b) <= PLACEMENT_TOLERANCE_DIP
}

function topBarInPlace(topBarBounds, displayBounds, raised) {
  if (!topBarBounds) return true
  return within(topBarBounds.x, displayBounds.x)
    && within(topBarBounds.y, displayBounds.y)
    && within(topBarBounds.width, displayBounds.width)
    && (raised || within(topBarBounds.height, displayBounds.height))
}

function desktopInPlace(desktopBounds, displayBounds) {
  if (!desktopBounds) return true
  return within(desktopBounds.x, displayBounds.x)
    && within(desktopBounds.y, displayBounds.y)
    && within(desktopBounds.width, displayBounds.width)
    && within(desktopBounds.height, displayBounds.height)
}

function misplacedShells(placements) {
  return placements
    .filter((placement) => !topBarInPlace(placement.topBar, placement.display, placement.raised) || !desktopInPlace(placement.desktop, placement.display))
    .map((placement) => placement.displayId)
}

const SNAP_BACK_WINDOW_MS = 2000
const SNAP_BACKS_PER_WINDOW = 5

function planSnapBack(recentSnapBacks, now) {
  const recent = recentSnapBacks.filter((time) => now - time < SNAP_BACK_WINDOW_MS)
  if (recent.length >= SNAP_BACKS_PER_WINDOW) return { allowed: false, recent }
  return { allowed: true, recent: [...recent, now] }
}

module.exports = { planDisplayShells, planChangesShells, misplacedShells, planSnapBack }

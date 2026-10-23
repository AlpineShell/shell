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

module.exports = { planDisplayShells, planChangesShells }

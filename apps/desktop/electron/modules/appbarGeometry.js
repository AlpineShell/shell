function rectsMatch(a, b) {
  if (!a || !b) return false
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}

function reservedWorkArea(monitorBounds, barPx) {
  return {
    left: monitorBounds.left,
    top: monitorBounds.top + barPx,
    right: monitorBounds.right,
    bottom: monitorBounds.bottom,
  }
}

function barHeightForDpi(barHeightDIP, dpi) {
  return Math.round(barHeightDIP * (dpi || 96) / 96)
}

function needsWorkAreaUpdate(currentWorkArea, reserved) {
  return !rectsMatch(currentWorkArea, reserved)
}

function canRestoreWorkArea(targetMonitorBounds, monitorsOwnedByOtherBars) {
  if (!targetMonitorBounds) return false
  return !(monitorsOwnedByOtherBars || []).some((bounds) => rectsMatch(bounds, targetMonitorBounds))
}

module.exports = {
  rectsMatch,
  reservedWorkArea,
  barHeightForDpi,
  needsWorkAreaUpdate,
  canRestoreWorkArea,
}

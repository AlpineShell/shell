const DWMWCP_DEFAULT = 0
const DWMWCP_DONOTROUND = 1
const DWMWCP_ROUND = 2
const DWMWCP_ROUNDSMALL = 3

function isRoundedPreference(preference) {
  return preference === DWMWCP_ROUND || preference === DWMWCP_ROUNDSMALL
}

function coversMonitor(windowBounds, monitorBounds) {
  if (!windowBounds || !monitorBounds) return false
  return windowBounds.left <= monitorBounds.left
    && windowBounds.top <= monitorBounds.top
    && windowBounds.right >= monitorBounds.right
    && windowBounds.bottom >= monitorBounds.bottom
}

function shouldRequestRounding(window) {
  if (!window || !window.manageable) return false
  if (window.maximized) return false
  if (coversMonitor(window.bounds, window.monitorBounds)) return false
  return !isRoundedPreference(window.preference)
}

function deadTrackedWindows(tracked, isAlive) {
  const dead = []
  for (const hwnd of tracked.keys()) {
    if (!isAlive(hwnd)) dead.push(hwnd)
  }
  return dead
}

function restorableTrackedWindows(tracked, isAlive) {
  const restorable = []
  for (const [hwnd, preference] of tracked) {
    if (isAlive(hwnd)) restorable.push({ hwnd, preference })
  }
  return restorable
}

module.exports = {
  DWMWCP_DEFAULT,
  DWMWCP_DONOTROUND,
  DWMWCP_ROUND,
  DWMWCP_ROUNDSMALL,
  isRoundedPreference,
  coversMonitor,
  shouldRequestRounding,
  deadTrackedWindows,
  restorableTrackedWindows,
}

const { app, screen } = require('electron')
const windowEnum = require('./windowEnum')
const batterySaver = require('./batterySaver')
const { isExposedOwnWindow } = require('./exposedOwnWindows')
const { displayCoverage, sameCoverage } = require('./windowCoverageGeometry')

const POLL_INTERVAL_MS = 300
const BATTERY_SAVER_POLL_INTERVAL_MS = 1000

const coverageByDisplay = new Map()
let exposedOwnWindowsProvider = null
let broadcastToTopbarsRef = null
let stopPolling = null

function isShellInternalWindow(hwnd) {
  return windowEnum.windowProcessId(hwnd) === process.pid && !isExposedOwnWindow(hwnd, exposedOwnWindowsProvider)
}

function coveringWindowPredicate(hwnd, probe) {
  return windowEnum.onScreenWindowPredicate(hwnd, probe) && !isShellInternalWindow(hwnd)
}

function coveringWindowFrames() {
  return windowEnum.enumerateWindows(coveringWindowPredicate)
    .map((hwnd) => windowEnum.windowFrameBounds(hwnd))
    .filter(Boolean)
}

function measureCoverage() {
  const frames = coveringWindowFrames()
  return screen.getAllDisplays().map((display) => ({
    displayId: display.id,
    rects: displayCoverage(frames, screen.dipToScreenRect(null, display.bounds), display.scaleFactor),
  }))
}

function coverageChanged(measured) {
  if (measured.length !== coverageByDisplay.size) return true
  return measured.some(({ displayId, rects }) => !sameCoverage(coverageByDisplay.get(displayId), rects))
}

function currentCoverage() {
  return [...coverageByDisplay].map(([displayId, rects]) => ({ displayId, rects }))
}

function publishCoverage() {
  const measured = measureCoverage()
  if (!coverageChanged(measured)) return
  coverageByDisplay.clear()
  for (const { displayId, rects } of measured) coverageByDisplay.set(displayId, rects)
  if (broadcastToTopbarsRef) broadcastToTopbarsRef('topbar/window-coverage-changed', currentCoverage())
}

function stop() {
  if (!stopPolling) return
  stopPolling()
  stopPolling = null
}

module.exports = {
  setExposedOwnWindows(provider) {
    exposedOwnWindowsProvider = typeof provider === 'function' ? provider : null
  },
  handlers: {
    'topbar/window-coverage': () => {
      publishCoverage()
      return currentCoverage()
    },
  },
  start(_broadcast, broadcastToTopbars) {
    broadcastToTopbarsRef = broadcastToTopbars
    stopPolling = batterySaver.startAdaptivePolling(publishCoverage, POLL_INTERVAL_MS, BATTERY_SAVER_POLL_INTERVAL_MS)
    app.on('will-quit', stop)
  },
}

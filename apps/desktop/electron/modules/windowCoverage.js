const { app, screen } = require('electron')
const windowEnum = require('./windowEnum')
const batterySaver = require('./batterySaver')
const { isExposedOwnWindow } = require('./exposedOwnWindows')
const { displayCoverage, sameCoverage } = require('./windowCoverageGeometry')
const { createSweepMemo } = require('./windowSweepMemo')

const POLL_INTERVAL_MS = 300
const BATTERY_SAVER_POLL_INTERVAL_MS = 1000
const DISPLAY_CHANGE_EVENTS = ['display-added', 'display-removed', 'display-metrics-changed']

const coverageByDisplay = new Map()
const classNames = createSweepMemo((hwnd) => windowEnum.windowProbe.className(hwnd))
const processIds = createSweepMemo((hwnd) => windowEnum.windowProcessId(hwnd))
const coveringWindowProbe = { ...windowEnum.windowProbe, className: classNames.valueFor }
let exposedOwnWindowsProvider = null
let broadcastToTopbarsRef = null
let stopPolling = null
let cachedDisplayAreas = null
let watchingDisplays = false

function isShellInternalWindow(hwnd) {
  return processIds.valueFor(hwnd) === process.pid && !isExposedOwnWindow(hwnd, exposedOwnWindowsProvider)
}

function coveringWindowPredicate(hwnd) {
  return windowEnum.onScreenWindowPredicate(hwnd, coveringWindowProbe) && !isShellInternalWindow(hwnd)
}

function coveringWindowHandles() {
  try {
    return windowEnum.enumerateWindows(coveringWindowPredicate)
  } finally {
    classNames.finishSweep()
    processIds.finishSweep()
  }
}

function coveringWindowFrames() {
  return coveringWindowHandles()
    .map((hwnd) => windowEnum.windowFrameBounds(hwnd))
    .filter(Boolean)
}

function forgetDisplayAreas() {
  cachedDisplayAreas = null
}

function watchDisplayChanges() {
  if (watchingDisplays) return
  watchingDisplays = true
  for (const eventName of DISPLAY_CHANGE_EVENTS) screen.on(eventName, forgetDisplayAreas)
}

function displayAreas() {
  watchDisplayChanges()
  if (cachedDisplayAreas) return cachedDisplayAreas
  cachedDisplayAreas = screen.getAllDisplays().map((display) => ({
    displayId: display.id,
    screenBounds: screen.dipToScreenRect(null, display.bounds),
    scaleFactor: display.scaleFactor,
  }))
  return cachedDisplayAreas
}

function measureCoverage() {
  const frames = coveringWindowFrames()
  return displayAreas().map(({ displayId, screenBounds, scaleFactor }) => ({
    displayId,
    rects: displayCoverage(frames, screenBounds, scaleFactor),
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

function stopWatchingDisplays() {
  if (!watchingDisplays) return
  for (const eventName of DISPLAY_CHANGE_EVENTS) screen.removeListener(eventName, forgetDisplayAreas)
  watchingDisplays = false
  forgetDisplayAreas()
}

function stop() {
  stopWatchingDisplays()
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

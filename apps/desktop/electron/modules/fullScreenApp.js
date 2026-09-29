const koffi = require('koffi')
const winFocus = require('./winFocus')
const windowEnum = require('./windowEnum')
const { getMonitorForWindow } = require('./appbar')
const { coversWholeMonitor } = require('./windowCoverageGeometry')

const IsZoomed = koffi.load('user32.dll').func('__stdcall', 'IsZoomed', 'int', ['uintptr_t'])

function isShellWindow(hwnd) {
  return windowEnum.windowProcessId(hwnd) === process.pid
}

function foregroundAppIsFullScreen() {
  const hwnd = winFocus.getForegroundWindow()
  if (!hwnd || isShellWindow(hwnd) || IsZoomed(hwnd)) return false
  if (!windowEnum.onScreenWindowPredicate(hwnd, windowEnum.windowProbe)) return false
  const monitor = getMonitorForWindow(hwnd)
  return coversWholeMonitor(windowEnum.windowFrameBounds(hwnd), monitor && monitor.bounds)
}

module.exports = { foregroundAppIsFullScreen }

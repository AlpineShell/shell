const koffi = require('koffi')
const winEvents = require('./winEvents')
const {
  DWMWCP_ROUNDSMALL,
  shouldApplyCornerPreference,
  shouldRestoreCornerPreference,
  deadTrackedWindows,
  restorableTrackedWindows,
} = require('./windowCornerPolicy')

const user32 = koffi.load('user32.dll')

let dwmapi = null
try { dwmapi = koffi.load('dwmapi.dll') } catch (_) {}

const CORNERS_ENUM_PROC = koffi.proto('__stdcall', 'WindowCornersEnumProc', 'int', ['uintptr_t', 'intptr_t'])

const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'int', ['WindowCornersEnumProc *', 'intptr_t'])

const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const IsZoomed = user32.func('__stdcall', 'IsZoomed', 'int', ['uintptr_t'])
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int'])
const GetWindowTextLengthW = user32.func('__stdcall', 'GetWindowTextLengthW', 'int', ['uintptr_t'])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const MonitorFromWindow = user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32'])
const GetMonitorInfoW = user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', 'void *'])

let DwmGetWindowAttribute = null
let DwmSetWindowAttribute = null
if (dwmapi) {
  DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
  DwmSetWindowAttribute = dwmapi.func('__stdcall', 'DwmSetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
}

const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const DWMWA_CLOAKED = 14
const DWMWA_WINDOW_CORNER_PREFERENCE = 33
const E_INVALIDARG = -2147024809

const MONITOR_DEFAULTTONEAREST = 2
const MONITORINFO_SIZE = 40
const MAX_TRACKED_WINDOWS = 256
const CORNER_TARGET = DWMWCP_ROUNDSMALL

const originalPreferences = new Map()
let unsubscribeWinEvents = null
let enumProcPointer = null
let cornerApiAvailable = !!DwmSetWindowAttribute

function toNum(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function readRect(buf) {
  return {
    left: buf.readInt32LE(0),
    top: buf.readInt32LE(4),
    right: buf.readInt32LE(8),
    bottom: buf.readInt32LE(12),
  }
}

function isCloaked(hwnd) {
  if (!DwmGetWindowAttribute) return false
  const buf = Buffer.alloc(4)
  DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, buf, 4)
  return buf.readUInt32LE(0) !== 0
}

function isManageableWindow(hwnd) {
  if (!hwnd || !IsWindow(hwnd) || !IsWindowVisible(hwnd)) return false
  if (GetWindowTextLengthW(hwnd) <= 0) return false
  if (GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) return false
  const pidBuf = Buffer.alloc(4)
  GetWindowThreadProcessId(hwnd, pidBuf)
  if (pidBuf.readUInt32LE(0) === process.pid) return false
  if (isCloaked(hwnd)) return false
  return true
}

function getWindowBounds(hwnd) {
  const buf = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, buf)) return null
  return readRect(buf)
}

function getMonitorBounds(hwnd) {
  const monitor = toNum(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST))
  if (!monitor) return null
  const info = Buffer.alloc(MONITORINFO_SIZE)
  info.writeUInt32LE(MONITORINFO_SIZE, 0)
  if (!GetMonitorInfoW(monitor, info)) return null
  return readRect(info.subarray(4, 20))
}

function readCornerPreference(hwnd) {
  if (!DwmGetWindowAttribute) return null
  const buf = Buffer.alloc(4)
  const hr = DwmGetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, buf, 4)
  if (hr !== 0) return null
  return buf.readInt32LE(0)
}

function writeCornerPreference(hwnd, preference) {
  const buf = Buffer.alloc(4)
  buf.writeInt32LE(preference, 0)
  const hr = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, buf, 4)
  if (hr === E_INVALIDARG) {
    cornerApiAvailable = false
    console.log('[windowCorners] Corner preferences are unavailable on this Windows build')
  }
  return hr === 0
}

function pruneClosedWindows() {
  if (originalPreferences.size < MAX_TRACKED_WINDOWS) return
  for (const hwnd of deadTrackedWindows(originalPreferences, IsWindow)) {
    originalPreferences.delete(hwnd)
  }
}

function restoreTrackedWindow(hwnd) {
  const preference = originalPreferences.get(hwnd)
  if (preference === undefined) return
  if (writeCornerPreference(hwnd, preference)) originalPreferences.delete(hwnd)
}

function roundWindow(hwndRaw) {
  if (!cornerApiAvailable) return
  const hwnd = toNum(hwndRaw)
  if (!hwnd || !isManageableWindow(hwnd)) return

  const bounds = getWindowBounds(hwnd)
  const monitorBounds = getMonitorBounds(hwnd)

  if (originalPreferences.has(hwnd)) {
    if (shouldRestoreCornerPreference({ manageable: true, bounds, monitorBounds })) {
      restoreTrackedWindow(hwnd)
    }
    return
  }

  const preference = readCornerPreference(hwnd)
  if (preference === null) return

  const candidate = {
    manageable: true,
    maximized: !!IsZoomed(hwnd),
    preference,
    bounds,
    monitorBounds,
  }
  if (!shouldApplyCornerPreference(candidate, CORNER_TARGET)) return

  pruneClosedWindows()
  if (!writeCornerPreference(hwnd, CORNER_TARGET)) return
  originalPreferences.set(hwnd, preference)
}

function restoreAllWindows() {
  if (!DwmSetWindowAttribute) return
  for (const { hwnd, preference } of restorableTrackedWindows(originalPreferences, IsWindow)) {
    try { writeCornerPreference(hwnd, preference) } catch (_) {}
  }
  originalPreferences.clear()
}

function roundExistingWindows() {
  try {
    enumProcPointer = koffi.register((hwnd) => {
      roundWindow(hwnd)
      return 1
    }, koffi.pointer(CORNERS_ENUM_PROC))
    EnumWindows(enumProcPointer, 0)
  } catch (e) {
    console.error('[windowCorners] initial sweep error:', e.message)
  } finally {
    if (enumProcPointer) {
      try { koffi.unregister(enumProcPointer) } catch (_) {}
      enumProcPointer = null
    }
  }
}

function stop() {
  if (unsubscribeWinEvents) {
    unsubscribeWinEvents()
    unsubscribeWinEvents = null
  }
  restoreAllWindows()
}

function roundOwnWindow(browserWindow) {
  if (!cornerApiAvailable || !browserWindow || browserWindow.isDestroyed()) return
  try {
    writeCornerPreference(browserWindow.getNativeWindowHandle().readUInt32LE(0), CORNER_TARGET)
  } catch (e) {
    console.error('[windowCorners] rounding an own window failed:', e.message)
  }
}

module.exports = {
  roundOwnWindow,
  start() {
    if (!cornerApiAvailable) return
    const { app } = require('electron')
    unsubscribeWinEvents = winEvents.subscribe('windowCorners', winEvents.SYSTEM_WINDOW_EVENTS, roundWindow)
    setTimeout(roundExistingWindows, 2000)
    app.on('will-quit', stop)
  },
}

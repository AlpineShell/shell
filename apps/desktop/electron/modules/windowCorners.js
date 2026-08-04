const koffi = require('koffi')
const {
  DWMWCP_ROUND,
  shouldRequestRounding,
  deadTrackedWindows,
  restorableTrackedWindows,
} = require('./windowCornerPolicy')

const user32 = koffi.load('user32.dll')

let dwmapi = null
try { dwmapi = koffi.load('dwmapi.dll') } catch (_) {}

const CORNERS_ENUM_PROC = koffi.proto('__stdcall', 'WindowCornersEnumProc', 'int', ['uintptr_t', 'intptr_t'])
const CORNERS_WIN_EVENT_PROC = koffi.proto('__stdcall', 'WindowCornersWinEventProc', 'void', ['uintptr_t', 'uint32', 'uintptr_t', 'int32', 'int32', 'uint32', 'uint32'])

const SetWinEventHook = user32.func('__stdcall', 'SetWinEventHook', 'uintptr_t', ['uint32', 'uint32', 'uintptr_t', 'WindowCornersWinEventProc *', 'uint32', 'uint32', 'uint32'])
const UnhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'int', ['uintptr_t'])
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

const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_SYSTEM_MOVESIZEEND = 0x000b
const EVENT_SYSTEM_MINIMIZEEND = 0x0017
const WINEVENT_OUTOFCONTEXT = 0x0000
const WINEVENT_SKIPOWNPROCESS = 0x0002
const OBJID_WINDOW = 0
const CHILDID_SELF = 0

const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const DWMWA_CLOAKED = 14
const DWMWA_WINDOW_CORNER_PREFERENCE = 33
const E_INVALIDARG = -2147024809

const MONITOR_DEFAULTTONEAREST = 2
const MONITORINFO_SIZE = 40
const MAX_TRACKED_WINDOWS = 256

const originalPreferences = new Map()
let winEventHookHandle = null
let winEventProcPointer = null
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

function roundWindow(hwndRaw) {
  if (!cornerApiAvailable) return
  const hwnd = toNum(hwndRaw)
  if (!hwnd || originalPreferences.has(hwnd)) return
  if (!isManageableWindow(hwnd)) return

  const preference = readCornerPreference(hwnd)
  if (preference === null) return

  const candidate = {
    manageable: true,
    maximized: !!IsZoomed(hwnd),
    preference,
    bounds: getWindowBounds(hwnd),
    monitorBounds: getMonitorBounds(hwnd),
  }
  if (!shouldRequestRounding(candidate)) return

  pruneClosedWindows()
  if (!writeCornerPreference(hwnd, DWMWCP_ROUND)) return
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

function onWinEvent(_hook, _event, hwndRaw, idObject, idChild) {
  try {
    if (idObject !== OBJID_WINDOW || idChild !== CHILDID_SELF) return
    roundWindow(hwndRaw)
  } catch (e) {
    console.error('[windowCorners] win event error:', e.message)
  }
}

function installWinEventHook() {
  try {
    winEventProcPointer = koffi.register(onWinEvent, koffi.pointer(CORNERS_WIN_EVENT_PROC))
    winEventHookHandle = SetWinEventHook(
      EVENT_SYSTEM_FOREGROUND,
      EVENT_SYSTEM_MINIMIZEEND,
      0,
      winEventProcPointer,
      0,
      0,
      WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
    )
    if (!toNum(winEventHookHandle)) {
      console.error('[windowCorners] Failed to install win event hook')
      winEventHookHandle = null
      try { koffi.unregister(winEventProcPointer) } catch (_) {}
      winEventProcPointer = null
    }
  } catch (e) {
    console.error('[windowCorners] win event hook install error:', e.message)
  }
}

function uninstallWinEventHook() {
  if (winEventHookHandle) {
    try { UnhookWinEvent(winEventHookHandle) } catch (_) {}
    winEventHookHandle = null
  }
  if (winEventProcPointer) {
    try { koffi.unregister(winEventProcPointer) } catch (_) {}
    winEventProcPointer = null
  }
}

function stop() {
  uninstallWinEventHook()
  restoreAllWindows()
}

module.exports = {
  start() {
    if (!cornerApiAvailable) return
    const { app } = require('electron')
    installWinEventHook()
    setTimeout(roundExistingWindows, 2000)
    app.on('will-quit', stop)
  },
}

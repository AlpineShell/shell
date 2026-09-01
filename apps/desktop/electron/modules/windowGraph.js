const koffi = require('koffi')
const windowEnum = require('./windowEnum')
const occlusionPolicy = require('./occlusionPolicy')

const user32 = koffi.load('user32.dll')

let dwmapi = null
try { dwmapi = koffi.load('dwmapi.dll') } catch (_) {}

const MONITOR_ENUM_PROC = koffi.proto('__stdcall', 'WindowGraphMonitorEnumProc', 'int', ['uintptr_t', 'uintptr_t', 'void *', 'intptr_t'])

const EnumDisplayMonitors = user32.func('__stdcall', 'EnumDisplayMonitors', 'int', ['uintptr_t', 'void *', 'WindowGraphMonitorEnumProc *', 'intptr_t'])
const GetMonitorInfoW = user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', 'void *'])
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int'])
const GetWindowTextLengthW = user32.func('__stdcall', 'GetWindowTextLengthW', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const GetLayeredWindowAttributes = user32.func('__stdcall', 'GetLayeredWindowAttributes', 'int', ['uintptr_t', 'void *', 'void *', 'void *'])
const MonitorFromWindow = user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32'])

let DwmGetWindowAttribute = null
if (dwmapi) {
  DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
}

const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_POPUP = 0x80000000
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_TRANSPARENT = 0x00000020
const WS_EX_LAYERED = 0x00080000
const WS_EX_NOREDIRECTIONBITMAP = 0x00200000
const LWA_ALPHA = 0x00000002

const DWMWA_CLOAKED = 14
const DWMWA_EXTENDED_FRAME_BOUNDS = 9

const MONITORINFO_SIZE = 40
const MONITOR_DEFAULTTONEAREST = 2
const OPAQUE_ALPHA = 255

function toNum(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function readRect(buffer, offset) {
  return {
    left: buffer.readInt32LE(offset),
    top: buffer.readInt32LE(offset + 4),
    right: buffer.readInt32LE(offset + 8),
    bottom: buffer.readInt32LE(offset + 12),
  }
}

function listMonitors() {
  const monitors = []
  let callback = null
  try {
    callback = koffi.register((monitor) => {
      const info = Buffer.alloc(MONITORINFO_SIZE)
      info.writeUInt32LE(MONITORINFO_SIZE, 0)
      if (GetMonitorInfoW(monitor, info)) monitors.push(readRect(info, 4))
      return 1
    }, koffi.pointer(MONITOR_ENUM_PROC))
    EnumDisplayMonitors(0, null, callback, 0)
  } catch (e) {
    console.error('[windowGraph] monitor enumeration failed:', e?.message ?? e)
  } finally {
    if (callback) {
      try { koffi.unregister(callback) } catch (_) {}
    }
  }
  return monitors
}

function isCloaked(hwnd) {
  if (!DwmGetWindowAttribute) return false
  const value = Buffer.alloc(4)
  if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, value, 4) !== 0) return false
  return value.readUInt32LE(0) !== 0
}

function paintedBounds(hwnd) {
  if (DwmGetWindowAttribute) {
    const frame = Buffer.alloc(16)
    if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, frame, 16) === 0) {
      const bounds = readRect(frame, 0)
      if (!occlusionPolicy.isEmptyRect(bounds)) return bounds
    }
  }
  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null
  return readRect(rect, 0)
}

function isTranslucentLayered(hwnd, exStyle) {
  if ((exStyle & WS_EX_LAYERED) === 0) return false
  const key = Buffer.alloc(4)
  const alpha = Buffer.alloc(1)
  const flags = Buffer.alloc(4)
  if (!GetLayeredWindowAttributes(hwnd, key, alpha, flags)) return true
  const attributes = flags.readUInt32LE(0)
  if ((attributes & LWA_ALPHA) !== 0 && alpha.readUInt8(0) < OPAQUE_ALPHA) return true
  return attributes !== 0 && (attributes & LWA_ALPHA) === 0
}

function doesNotPaintReliably(hwnd, style, exStyle) {
  if ((exStyle & WS_EX_TRANSPARENT) !== 0) return true
  if ((exStyle & WS_EX_NOREDIRECTIONBITMAP) !== 0) return true
  if ((style & WS_POPUP) !== 0 && GetWindowTextLengthW(hwnd) <= 0) return true
  return isTranslucentLayered(hwnd, exStyle)
}

function describeWindow(hwnd, shellPids) {
  const style = GetWindowLongW(hwnd, GWL_STYLE)
  const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE)
  const pid = windowEnum.windowProcessId(hwnd)
  const bounds = paintedBounds(hwnd)
  return {
    hwnd,
    pid,
    bounds,
    minimized: IsIconic(hwnd) !== 0,
    cloaked: isCloaked(hwnd),
    toolWindow: (exStyle & WS_EX_TOOLWINDOW) !== 0,
    transparent: doesNotPaintReliably(hwnd, style, exStyle),
    shellOwned: Boolean(shellPids?.has?.(pid)),
    titled: GetWindowTextLengthW(hwnd) > 0,
  }
}

function isCandidateWindow(hwnd) {
  return IsWindowVisible(hwnd) !== 0
}

function collectWindows(shellPids) {
  let handles = []
  try {
    handles = windowEnum.enumerateWindows(isCandidateWindow)
  } catch (e) {
    console.error('[windowGraph] window enumeration failed:', e?.message ?? e)
    return []
  }
  const windows = []
  for (const hwnd of handles) {
    const described = describeWindow(hwnd, shellPids)
    if (!described.bounds) continue
    windows.push(described)
  }
  return windows
}

function isGovernable(window) {
  if (!window.titled) return false
  if (window.toolWindow) return false
  if (window.shellOwned) return false
  return Number.isFinite(window.pid) && window.pid > 0
}

function snapshot(shellPids) {
  const monitors = listMonitors()
  const windows = collectWindows(shellPids)
  const withVisibility = occlusionPolicy.computeWindowVisibility(windows, monitors)
  return {
    monitors,
    windows: withVisibility,
    governable: withVisibility.filter(isGovernable),
  }
}

function foregroundWindow() {
  return toNum(GetForegroundWindow())
}

function monitorBoundsForWindow(hwnd) {
  const monitor = toNum(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST))
  if (!monitor) return null
  const info = Buffer.alloc(MONITORINFO_SIZE)
  info.writeUInt32LE(MONITORINFO_SIZE, 0)
  if (!GetMonitorInfoW(monitor, info)) return null
  return readRect(info, 4)
}

function fullscreenPids(graph, shellPids) {
  const covering = new Set()
  for (const window of graph?.windows ?? []) {
    if (window.minimized || window.cloaked || window.toolWindow) continue
    if (shellPids?.has?.(window.pid)) continue
    if (!window.pid || !window.bounds) continue
    if (occlusionPolicy.coversMonitor(window.bounds, graph.monitors)) covering.add(window.pid)
  }
  return covering
}

function fullscreenForegroundPid(shellPids) {
  const hwnd = foregroundWindow()
  if (!hwnd) return null
  const pid = windowEnum.windowProcessId(hwnd)
  if (!pid || shellPids?.has?.(pid)) return null
  if ((GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) !== 0) return null
  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null
  const monitor = monitorBoundsForWindow(hwnd)
  if (!monitor) return null
  return occlusionPolicy.coversMonitor(readRect(rect, 0), [monitor]) ? pid : null
}

module.exports = {
  listMonitors,
  paintedBounds,
  describeWindow,
  collectWindows,
  isGovernable,
  snapshot,
  fullscreenPids,
  foregroundWindow,
  monitorBoundsForWindow,
  fullscreenForegroundPid,
}

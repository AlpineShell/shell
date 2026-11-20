const { coversMonitor } = require('./windowCornerPolicy')

const HWND_BOTTOM = 1
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const SINK_FLAGS = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
const MONITOR_DEFAULTTONEAREST = 2
const MONITORINFO_SIZE = 40
const MAX_CLASS_NAME_CHARS = 256
const DESKTOP_WINDOW_CLASSES = new Set(['Progman', 'WorkerW'])

let nativeBindings = null
const classNameBuffer = Buffer.alloc(MAX_CLASS_NAME_CHARS * 2)
const windowRectBuffer = Buffer.alloc(16)
const monitorInfoBuffer = Buffer.alloc(MONITORINFO_SIZE)

function loadNativeBindings() {
  if (nativeBindings) return nativeBindings
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  nativeBindings = {
    SetWindowPos: user32.func('__stdcall', 'SetWindowPos', 'int', ['uintptr_t', 'uintptr_t', 'int', 'int', 'int', 'int', 'uint32']),
    GetForegroundWindow: user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', []),
    IsWindowVisible: user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t']),
    IsIconic: user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t']),
    GetClassNameW: user32.func('__stdcall', 'GetClassNameW', 'int', ['uintptr_t', 'void *', 'int']),
    GetWindowRect: user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *']),
    MonitorFromWindow: user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32']),
    GetMonitorInfoW: user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', 'void *']),
  }
  return nativeBindings
}

function toNum(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function windowHandleNumber(win) {
  if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return 0
  try {
    const buffer = win.getNativeWindowHandle()
    return buffer.byteLength === 8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE()
  } catch {
    return 0
  }
}

function planPassiveTopBarOrder({ topBarHandle, desktopHandle, desktopHosted, shellWindowHandle }) {
  if (!topBarHandle) return []
  const order = [{ hwnd: topBarHandle, insertAfter: HWND_BOTTOM }]
  if (!desktopHosted && desktopHandle) order.push({ hwnd: desktopHandle, insertAfter: HWND_BOTTOM })
  if (shellWindowHandle) order.push({ hwnd: shellWindowHandle, insertAfter: HWND_BOTTOM })
  return order
}

function isFullscreenForegroundForDisplay(foreground, displayMonitorBounds) {
  if (!foreground || !foreground.exists || !foreground.visible || foreground.minimized) return false
  if (foreground.shellSurface || DESKTOP_WINDOW_CLASSES.has(foreground.className)) return false
  return coversMonitor(foreground.bounds, foreground.monitorBounds)
    && coversMonitor(foreground.bounds, displayMonitorBounds)
}

function readRect(buffer, offset = 0) {
  return {
    left: buffer.readInt32LE(offset),
    top: buffer.readInt32LE(offset + 4),
    right: buffer.readInt32LE(offset + 8),
    bottom: buffer.readInt32LE(offset + 12),
  }
}

function readWindowRect(hwnd) {
  if (!loadNativeBindings().GetWindowRect(hwnd, windowRectBuffer)) return null
  return readRect(windowRectBuffer, 0)
}

function readMonitorBounds(hwnd) {
  const native = loadNativeBindings()
  const monitor = toNum(native.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST))
  if (!monitor) return null
  monitorInfoBuffer.writeUInt32LE(MONITORINFO_SIZE, 0)
  if (!native.GetMonitorInfoW(monitor, monitorInfoBuffer)) return null
  return readRect(monitorInfoBuffer, 4)
}

function readWindowClassName(hwnd) {
  const length = loadNativeBindings().GetClassNameW(hwnd, classNameBuffer, MAX_CLASS_NAME_CHARS)
  if (length <= 0) return ''
  const text = classNameBuffer.toString('utf16le', 0, Math.min(length, MAX_CLASS_NAME_CHARS) * 2)
  const terminator = text.indexOf('\0')
  return terminator === -1 ? text : text.slice(0, terminator)
}

function sinkPassiveTopBar(shell, shellWindowHandle = 0) {
  if (!shell) return
  const steps = planPassiveTopBarOrder({
    topBarHandle: windowHandleNumber(shell.topBar),
    desktopHandle: windowHandleNumber(shell.desktop),
    desktopHosted: Boolean(shell.desktopHosted),
    shellWindowHandle,
  })
  if (steps.length === 0) return
  try {
    const { SetWindowPos } = loadNativeBindings()
    for (const { hwnd, insertAfter } of steps) {
      SetWindowPos(hwnd, insertAfter, 0, 0, 0, 0, SINK_FLAGS)
    }
  } catch (e) {
    console.error('[topBarZOrder] sink error:', e && e.message)
  }
}

function isTopBarCoveredByFullscreenApp(topBarWin, isShellSurface) {
  const topBarHandle = windowHandleNumber(topBarWin)
  if (!topBarHandle) return false
  try {
    const native = loadNativeBindings()
    const foregroundHandle = toNum(native.GetForegroundWindow())
    if (!foregroundHandle || foregroundHandle === topBarHandle) return false
    if (typeof isShellSurface === 'function' && isShellSurface(foregroundHandle)) return false
    if (native.IsWindowVisible(foregroundHandle) === 0 || native.IsIconic(foregroundHandle) !== 0) return false
    const foreground = {
      exists: true,
      visible: true,
      minimized: false,
      shellSurface: false,
      className: readWindowClassName(foregroundHandle),
      bounds: readWindowRect(foregroundHandle),
      monitorBounds: readMonitorBounds(foregroundHandle),
    }
    return isFullscreenForegroundForDisplay(foreground, readMonitorBounds(topBarHandle))
  } catch {
    return false
  }
}

module.exports = {
  HWND_BOTTOM,
  planPassiveTopBarOrder,
  isFullscreenForegroundForDisplay,
  sinkPassiveTopBar,
  isTopBarCoveredByFullscreenApp,
}

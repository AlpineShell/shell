const { app } = require('electron')
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')

let DwmGetWindowAttribute = null
try {
  const dwmapi = koffi.load('dwmapi.dll')
  DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
} catch (_) {}

const MIN_TO_TOPBAR_WIN_EVENT_PROC = koffi.proto('__stdcall', 'MinToTopbarWinEventProc', 'void', ['uintptr_t', 'uint32', 'uintptr_t', 'int32', 'int32', 'uint32', 'uint32'])
const SetWinEventHook = user32.func('__stdcall', 'SetWinEventHook', 'uintptr_t', ['uint32', 'uint32', 'uintptr_t', 'MinToTopbarWinEventProc *', 'uint32', 'uint32', 'uint32'])
const UnhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'int', ['uintptr_t'])

const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int'])
const GetWindowTextLengthW = user32.func('__stdcall', 'GetWindowTextLengthW', 'int', ['uintptr_t'])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const GetSystemMetrics = user32.func('__stdcall', 'GetSystemMetrics', 'int', ['int'])
const MonitorFromWindow = user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32'])
const GetMonitorInfoW = user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', 'void *'])
const GetWindowPlacement = user32.func('__stdcall', 'GetWindowPlacement', 'int', ['uintptr_t', 'void *'])
const SetWindowPlacement = user32.func('__stdcall', 'SetWindowPlacement', 'int', ['uintptr_t', 'void *'])
const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', 'int', ['uintptr_t', 'uintptr_t', 'int', 'int', 'int', 'int', 'uint32'])

const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_SYSTEM_MINIMIZESTART = 0x0016
const EVENT_SYSTEM_MINIMIZEEND = 0x0017
const WINEVENT_OUTOFCONTEXT = 0x0000
const WINEVENT_SKIPOWNPROCESS = 0x0002
const OBJID_WINDOW = 0
const CHILDID_SELF = 0

const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const DWMWA_CLOAKED = 14

const SW_SHOWNORMAL = 1
const SW_SHOWMINIMIZED = 2
const SW_SHOWMAXIMIZED = 3
const WPF_SETMINPOSITION = 0x0001

const SM_CXMINIMIZED = 57
const SM_CYMINIMIZED = 58
const MONITOR_DEFAULTTONEAREST = 2

const SWP_NOSIZE = 0x0001
const SWP_NOZORDER = 0x0004
const SWP_NOACTIVATE = 0x0010

const WINDOWPLACEMENT_SIZE = 44
const MONITORINFO_SIZE = 40
const PARK_SETTLE_MS = 300
const MAX_TRACKED_TARGETS = 128

let winEventHookHandle = null
let winEventProcPointer = null
const minPositionTargets = new Map()
const pendingParks = new Map()

function toNum(value) {
  return typeof value === 'bigint' ? Number(value) : value
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

function topbarParkPosition(hwnd) {
  const monitor = toNum(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST))
  if (!monitor) return null
  const info = Buffer.alloc(MONITORINFO_SIZE)
  info.writeUInt32LE(MONITORINFO_SIZE, 0)
  if (!GetMonitorInfoW(monitor, info)) return null
  const left = info.readInt32LE(4)
  const top = info.readInt32LE(8)
  const right = info.readInt32LE(12)
  const stubWidth = GetSystemMetrics(SM_CXMINIMIZED) || 160
  const stubHeight = GetSystemMetrics(SM_CYMINIMIZED) || 31
  const x = left + Math.round((right - left - stubWidth) / 2)
  const y = top - stubHeight - 2
  return { x, y }
}

function aimMinimizeAtTopbar(hwnd) {
  if (!isManageableWindow(hwnd)) return
  const target = topbarParkPosition(hwnd)
  if (!target) return
  const previous = minPositionTargets.get(hwnd)
  if (previous && previous.x === target.x && previous.y === target.y) return

  const placement = Buffer.alloc(WINDOWPLACEMENT_SIZE)
  placement.writeUInt32LE(WINDOWPLACEMENT_SIZE, 0)
  if (!GetWindowPlacement(hwnd, placement)) return
  const showCmd = placement.readUInt32LE(8)
  if (showCmd !== SW_SHOWNORMAL && showCmd !== SW_SHOWMAXIMIZED) return

  placement.writeUInt32LE(placement.readUInt32LE(4) | WPF_SETMINPOSITION, 4)
  placement.writeInt32LE(target.x, 12)
  placement.writeInt32LE(target.y, 16)
  if (!SetWindowPlacement(hwnd, placement)) return

  if (minPositionTargets.size >= MAX_TRACKED_TARGETS) minPositionTargets.clear()
  minPositionTargets.set(hwnd, target)
}

function parkMinimizedWindow(hwnd) {
  if (!IsWindow(hwnd) || !IsIconic(hwnd) || !isManageableWindow(hwnd)) return
  const target = minPositionTargets.get(hwnd) || topbarParkPosition(hwnd)
  if (!target) return
  SetWindowPos(hwnd, 0, target.x, target.y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
}

function schedulePark(hwnd) {
  const existing = pendingParks.get(hwnd)
  if (existing) clearTimeout(existing)
  pendingParks.set(hwnd, setTimeout(() => {
    pendingParks.delete(hwnd)
    try {
      parkMinimizedWindow(hwnd)
    } catch (e) {
      console.error('[minimizeToTopbar] park error:', e.message)
    }
  }, PARK_SETTLE_MS))
}

function onWinEvent(_hook, event, hwndRaw, idObject, idChild) {
  try {
    if (idObject !== OBJID_WINDOW || idChild !== CHILDID_SELF) return
    const hwnd = toNum(hwndRaw)
    if (!hwnd) return
    if (event === EVENT_SYSTEM_FOREGROUND) {
      aimMinimizeAtTopbar(hwnd)
    } else if (event === EVENT_SYSTEM_MINIMIZESTART) {
      schedulePark(hwnd)
    }
  } catch (e) {
    console.error('[minimizeToTopbar] win event error:', e.message)
  }
}

function installWinEventHook() {
  try {
    winEventProcPointer = koffi.register(onWinEvent, koffi.pointer(MIN_TO_TOPBAR_WIN_EVENT_PROC))
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
      console.error('[minimizeToTopbar] Failed to install win event hook')
      winEventHookHandle = null
      try { koffi.unregister(winEventProcPointer) } catch (_) {}
      winEventProcPointer = null
    }
  } catch (e) {
    console.error('[minimizeToTopbar] win event hook install error:', e.message)
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
  for (const timer of pendingParks.values()) clearTimeout(timer)
  pendingParks.clear()
  minPositionTargets.clear()
}

module.exports = {
  start() {
    installWinEventHook()
    app.on('will-quit', uninstallWinEventHook)
  },
}

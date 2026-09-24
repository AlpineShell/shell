const winEvents = require('./winEvents')
const windowEnum = require('./windowEnum')
const openWithPlacementPolicy = require('./openWithPlacementPolicy')
const { createDiagnosticLog } = require('../diagnosticLog')

const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_OBJECT_DESTROY = 0x8001
const EVENT_OBJECT_SHOW = 0x8002
const EVENT_OBJECT_HIDE = 0x8003
const EVENT_OBJECT_LOCATIONCHANGE = 0x800B
const OBJID_WINDOW = 0
const CHILDID_SELF = 0
const WINEVENT_OUTOFCONTEXT = 0x0000
const MONITOR_DEFAULTTONEAREST = 0x2
const MONITORINFO_SIZE = 40
const RECT_SIZE = 16
const SWP_NOSIZE = 0x0001
const SWP_NOZORDER = 0x0004
const SWP_NOACTIVATE = 0x0010
const SWP_ASYNCWINDOWPOS = 0x4000
const LOG_FILE_NAME = 'open-with-placement-log.json'
const LOG_MAX_ENTRIES = 50

const diagnostics = createDiagnosticLog({ fileName: LOG_FILE_NAME, maxEntries: LOG_MAX_ENTRIES })

let native = null
let unsubscribeWinEvents = null
const trackedDialogs = new Map()

function toExactHandle(value) {
  if (typeof value !== 'bigint') return value
  const asNumber = Number(value)
  return BigInt(asNumber) === value ? asNumber : value
}

function loadNative() {
  if (native) return native
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  const proto = koffi.proto('__stdcall', 'OpenWithPlacementEventProc', 'void', ['uintptr_t', 'uint32', 'uintptr_t', 'int32', 'int32', 'uint32', 'uint32'])
  native = {
    koffi,
    procType: koffi.pointer(proto),
    GetCursorPos: user32.func('__stdcall', 'GetCursorPos', 'int', ['void *']),
    MonitorFromRect: user32.func('__stdcall', 'MonitorFromRect', 'uintptr_t', ['void *', 'uint32']),
    GetMonitorInfoW: user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', 'void *']),
    GetWindowRect: user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *']),
    SetWindowPos: user32.func('__stdcall', 'SetWindowPos', 'int', ['uintptr_t', 'uintptr_t', 'int', 'int', 'int', 'int', 'uint32']),
    SetWinEventHook: user32.func('__stdcall', 'SetWinEventHook', 'uintptr_t', ['uint32', 'uint32', 'uintptr_t', 'OpenWithPlacementEventProc *', 'uint32', 'uint32', 'uint32']),
    UnhookWinEvent: user32.func('__stdcall', 'UnhookWinEvent', 'int', ['uintptr_t']),
  }
  return native
}

function readRect(buffer, offset = 0) {
  return {
    left: buffer.readInt32LE(offset),
    top: buffer.readInt32LE(offset + 4),
    right: buffer.readInt32LE(offset + 8),
    bottom: buffer.readInt32LE(offset + 12),
  }
}

function rectBuffer({ left, top, right, bottom }) {
  const buffer = Buffer.alloc(RECT_SIZE)
  buffer.writeInt32LE(left, 0)
  buffer.writeInt32LE(top, 4)
  buffer.writeInt32LE(right, 8)
  buffer.writeInt32LE(bottom, 12)
  return buffer
}

function windowRect(hwnd) {
  const buffer = Buffer.alloc(RECT_SIZE)
  return loadNative().GetWindowRect(hwnd, buffer) ? readRect(buffer) : null
}

function workAreaNearest(rect) {
  const { MonitorFromRect, GetMonitorInfoW } = loadNative()
  const monitor = MonitorFromRect(rectBuffer(rect), MONITOR_DEFAULTTONEAREST)
  if (!monitor) return null
  const info = Buffer.alloc(MONITORINFO_SIZE)
  info.writeUInt32LE(MONITORINFO_SIZE, 0)
  return GetMonitorInfoW(monitor, info) ? readRect(info, 20) : null
}

function cursorWorkArea() {
  const point = Buffer.alloc(8)
  if (!loadNative().GetCursorPos(point)) return null
  const x = point.readInt32LE(0)
  const y = point.readInt32LE(4)
  return workAreaNearest({ left: x, top: y, right: x + 1, bottom: y + 1 })
}

function isOpenWithDialog(hwnd) {
  const className = windowEnum.windowProbe.className(hwnd)
  if (!openWithPlacementPolicy.isOpenWithClass(className)) return false
  const processId = windowEnum.windowProcessId(hwnd)
  if (!processId) return false
  return openWithPlacementPolicy.isOpenWithDialog({
    className,
    processName: windowEnum.processNameFromPath(windowEnum.processImagePath(processId)),
  })
}

function placeDialog(hwnd) {
  const rect = windowRect(hwnd)
  if (!rect) return
  const position = openWithPlacementPolicy.planOpenWithPlacement({
    rect,
    nearestWorkArea: workAreaNearest(rect),
    cursorWorkArea: cursorWorkArea(),
  })
  if (!position) return
  const moved = loadNative().SetWindowPos(hwnd, 0, position.x, position.y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS) !== 0
  diagnostics.record(moved ? 'moved' : 'move-refused', { from: rect, to: position })
}

function stopTracking(hwnd) {
  const tracked = trackedDialogs.get(hwnd)
  if (!tracked) return
  trackedDialogs.delete(hwnd)
  const { koffi, UnhookWinEvent } = loadNative()
  try { UnhookWinEvent(tracked.hook) } catch (_) {}
  try { koffi.unregister(tracked.proc) } catch (_) {}
}

function onTrackedDialogEvent(hwnd, event, idObject, idChild) {
  if (idObject !== OBJID_WINDOW || idChild !== CHILDID_SELF || !trackedDialogs.has(hwnd)) return
  if (event === EVENT_OBJECT_DESTROY || event === EVENT_OBJECT_HIDE) setImmediate(() => stopTracking(hwnd))
  else if (event === EVENT_OBJECT_LOCATIONCHANGE) placeDialog(hwnd)
}

function startTracking(hwnd) {
  if (trackedDialogs.has(hwnd)) return
  const { koffi, procType, SetWinEventHook } = loadNative()
  const proc = koffi.register((_hook, event, hwndRaw, idObject, idChild) => {
    try {
      onTrackedDialogEvent(toExactHandle(hwndRaw), event, idObject, idChild)
    } catch (e) {
      console.error('[openWithPlacement] tracking error:', e.message)
    }
  }, procType)
  const hook = SetWinEventHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_LOCATIONCHANGE, 0, proc, windowEnum.windowProcessId(hwnd), 0, WINEVENT_OUTOFCONTEXT)
  if (!hook) {
    try { koffi.unregister(proc) } catch (_) {}
    return
  }
  trackedDialogs.set(hwnd, { hook, proc })
}

function onWindowEvent(hwnd) {
  try {
    if (trackedDialogs.has(hwnd) || !isOpenWithDialog(hwnd)) return
    startTracking(hwnd)
    placeDialog(hwnd)
  } catch (e) {
    console.error('[openWithPlacement] placement error:', e.message)
  }
}

function stop() {
  if (unsubscribeWinEvents) unsubscribeWinEvents()
  unsubscribeWinEvents = null
  for (const hwnd of [...trackedDialogs.keys()]) stopTracking(hwnd)
}

module.exports = {
  start() {
    const { app } = require('electron')
    unsubscribeWinEvents = winEvents.subscribe('openWithPlacement', [EVENT_OBJECT_SHOW, EVENT_SYSTEM_FOREGROUND], onWindowEvent)
    app.on('will-quit', stop)
  },
}

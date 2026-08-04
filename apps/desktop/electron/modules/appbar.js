const koffi = require('koffi')
const {
  reservedWorkArea,
  barHeightForDpi,
  needsWorkAreaUpdate,
  canRestoreWorkArea,
} = require('./appbarGeometry')

const user32 = koffi.load('user32.dll')

const MonitorFromWindow = user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32'])
const MonitorFromRect = user32.func('__stdcall', 'MonitorFromRect', 'uintptr_t', ['void *', 'uint32'])
const GetMonitorInfoW = user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', 'void *'])
const SystemParametersInfoW = user32.func('__stdcall', 'SystemParametersInfoW', 'int', ['uint32', 'uint32', 'void *', 'uint32'])
const GetDpiForWindow = user32.func('__stdcall', 'GetDpiForWindow', 'uint32', ['uintptr_t'])

const SPI_SETWORKAREA = 0x002F
const SPIF_SENDCHANGE = 0x02
const MONITOR_DEFAULTTONEAREST = 0x02
const MONITOR_DEFAULTTONULL = 0x00
const MONITOR_INFO_SIZE = 40
const MONITOR_BOUNDS_OFFSET = 4
const MONITOR_WORK_AREA_OFFSET = 20
const REASSERT_DEBOUNCE_MS = 250

const registeredBars = new Map()
const monitorBoundsByDisplay = new Map()
let settingWorkArea = false
let reassertTimer = null

function isSettingWorkArea() {
  return settingWorkArea
}

function getHwndNumber(hwndBuf) {
  return hwndBuf.byteLength === 8
    ? Number(hwndBuf.readBigUInt64LE())
    : hwndBuf.readUInt32LE()
}

function toMonitorHandle(hMon) {
  return typeof hMon === 'bigint' ? Number(hMon) : hMon
}

function readRect(buf, offset) {
  return {
    left: buf.readInt32LE(offset),
    top: buf.readInt32LE(offset + 4),
    right: buf.readInt32LE(offset + 8),
    bottom: buf.readInt32LE(offset + 12),
  }
}

function toRectBuffer(rect) {
  const buf = Buffer.alloc(16)
  buf.writeInt32LE(rect.left, 0)
  buf.writeInt32LE(rect.top, 4)
  buf.writeInt32LE(rect.right, 8)
  buf.writeInt32LE(rect.bottom, 12)
  return buf
}

function readMonitor(hMon) {
  if (!hMon) return null

  const buf = Buffer.alloc(MONITOR_INFO_SIZE)
  buf.writeUInt32LE(MONITOR_INFO_SIZE, 0)

  if (!GetMonitorInfoW(toMonitorHandle(hMon), buf)) return null

  return {
    bounds: readRect(buf, MONITOR_BOUNDS_OFFSET),
    workArea: readRect(buf, MONITOR_WORK_AREA_OFFSET),
  }
}

function getMonitorForWindow(hWnd) {
  return readMonitor(MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST))
}

function getMonitorForRect(rect) {
  return readMonitor(MonitorFromRect(toRectBuffer(rect), MONITOR_DEFAULTTONULL))
}

function applyWorkArea(rect) {
  settingWorkArea = true
  const result = SystemParametersInfoW(SPI_SETWORKAREA, 0, toRectBuffer(rect), SPIF_SENDCHANGE)
  settingWorkArea = false
  return !!result
}

function getBarHeightPx(hWnd, barHeightDIP) {
  let dpi = 96
  try { dpi = GetDpiForWindow(hWnd) || 96 } catch (_) {}
  return barHeightForDpi(barHeightDIP, dpi)
}

function monitorsOwnedByBars(exceptWindowId) {
  const owned = []
  for (const [windowId, entry] of registeredBars) {
    if (windowId === exceptWindowId) continue
    const monitor = getMonitorForWindow(entry.hWnd)
    if (monitor) owned.push(monitor.bounds)
  }
  return owned
}

function setWorkArea(hWnd, barPx, displayId) {
  const monitor = getMonitorForWindow(hWnd)
  if (!monitor) return false

  monitorBoundsByDisplay.set(displayId, monitor.bounds)

  const reserved = reservedWorkArea(monitor.bounds, barPx)
  if (!needsWorkAreaUpdate(monitor.workArea, reserved)) return true

  const result = applyWorkArea(reserved)
  console.log(`[appbar] SetWorkArea display=${displayId} mon=${monitor.bounds.left},${monitor.bounds.top}-${monitor.bounds.right},${monitor.bounds.bottom} workTop=${reserved.top} result=${result}`)
  return result
}

function registerAppBar(win, display, barHeightDIP) {
  const hWnd = getHwndNumber(win.getNativeWindowHandle())
  const barPx = getBarHeightPx(hWnd, barHeightDIP)

  const success = setWorkArea(hWnd, barPx, display.id)
  registeredBars.set(win.id, { win, hWnd, displayId: display.id, barHeightDIP, barPx })

  if (!success) {
    console.error(`[appbar] Failed to set work area for display ${display.id}`)
  }
}

function reassertAll() {
  reassertTimer = null

  for (const [windowId, entry] of registeredBars) {
    if (entry.win.isDestroyed()) {
      registeredBars.delete(windowId)
      continue
    }
    entry.barPx = getBarHeightPx(entry.hWnd, entry.barHeightDIP)
    setWorkArea(entry.hWnd, entry.barPx, entry.displayId)
  }
}

function scheduleReassert() {
  if (reassertTimer) clearTimeout(reassertTimer)
  reassertTimer = setTimeout(reassertAll, REASSERT_DEBOUNCE_MS)
}

function unregisterAppBar(win) {
  const entry = registeredBars.get(win.id)
  if (!entry) return

  registeredBars.delete(win.id)

  const bounds = monitorBoundsByDisplay.get(entry.displayId)
  monitorBoundsByDisplay.delete(entry.displayId)
  if (!bounds) return

  const target = getMonitorForRect(bounds)
  if (!canRestoreWorkArea(target && target.bounds, monitorsOwnedByBars(win.id))) {
    console.log(`[appbar] Skipped work area restore for display ${entry.displayId}: monitor is gone or owned by another bar`)
    return
  }

  applyWorkArea(target.bounds)
  console.log(`[appbar] Unregistered window ${win.id}`)
}

function unregisterAll() {
  if (reassertTimer) {
    clearTimeout(reassertTimer)
    reassertTimer = null
  }

  for (const [displayId, bounds] of monitorBoundsByDisplay) {
    const target = getMonitorForRect(bounds)
    if (!target) continue
    applyWorkArea(target.bounds)
    console.log(`[appbar] Restored work area for display ${displayId}`)
  }

  monitorBoundsByDisplay.clear()
  registeredBars.clear()
}

module.exports = {
  registerAppBar,
  unregisterAppBar,
  unregisterAll,
  scheduleReassert,
  isSettingWorkArea,
}

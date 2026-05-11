const koffi = require('koffi')

const user32 = koffi.load('user32.dll')

const MonitorFromWindow = user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32'])
const GetMonitorInfoW = user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', 'void *'])
const SystemParametersInfoW = user32.func('__stdcall', 'SystemParametersInfoW', 'int', ['uint32', 'uint32', 'void *', 'uint32'])
const GetDpiForWindow = user32.func('__stdcall', 'GetDpiForWindow', 'uint32', ['uintptr_t'])

const SPI_SETWORKAREA = 0x002F
const SPIF_SENDCHANGE = 0x02
const MONITOR_DEFAULTTONEAREST = 0x02

const registeredBars = new Map()
const originalWorkAreas = new Map()
let settingWorkArea = false

function isSettingWorkArea() {
  return settingWorkArea
}

function getHwndNumber(hwndBuf) {
  return hwndBuf.byteLength === 8
    ? Number(hwndBuf.readBigUInt64LE())
    : hwndBuf.readUInt32LE()
}

function getMonitorRect(hWnd) {
  const hMon = MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST)
  if (!hMon) return null

  const buf = Buffer.alloc(40)
  buf.writeUInt32LE(40, 0)

  const ok = GetMonitorInfoW(typeof hMon === 'bigint' ? Number(hMon) : hMon, buf)
  if (!ok) return null

  return {
    left: buf.readInt32LE(4),
    top: buf.readInt32LE(8),
    right: buf.readInt32LE(12),
    bottom: buf.readInt32LE(16),
  }
}

function getBarHeightPx(hWnd, barHeightDIP) {
  let dpi = 96
  try { dpi = GetDpiForWindow(hWnd) || 96 } catch (_) {}
  return Math.round(barHeightDIP * dpi / 96)
}

function setWorkArea(hWnd, barPx, displayId) {
  const mon = getMonitorRect(hWnd)
  if (!mon) return false

  if (!originalWorkAreas.has(displayId)) {
    const orig = Buffer.alloc(16)
    orig.writeInt32LE(mon.left, 0)
    orig.writeInt32LE(mon.top, 4)
    orig.writeInt32LE(mon.right, 8)
    orig.writeInt32LE(mon.bottom, 12)
    originalWorkAreas.set(displayId, orig)
  }

  const rect = Buffer.alloc(16)
  rect.writeInt32LE(mon.left, 0)
  rect.writeInt32LE(mon.top + barPx, 4)
  rect.writeInt32LE(mon.right, 8)
  rect.writeInt32LE(mon.bottom, 12)

  settingWorkArea = true
  const result = SystemParametersInfoW(SPI_SETWORKAREA, 0, rect, SPIF_SENDCHANGE)
  settingWorkArea = false

  console.log(`[appbar] SetWorkArea display=${displayId} mon=${mon.left},${mon.top}-${mon.right},${mon.bottom} workTop=${mon.top + barPx} result=${result}`)
  return !!result
}

function registerAppBar(win, display, barHeightDIP) {
  const hWnd = getHwndNumber(win.getNativeWindowHandle())
  const barPx = getBarHeightPx(hWnd, barHeightDIP)

  const success = setWorkArea(hWnd, barPx, display.id)
  registeredBars.set(win.id, { hWnd, displayId: display.id, barHeightDIP, barPx })

  if (!success) {
    console.error(`[appbar] Failed to set work area for display ${display.id}`)
  }
}

function reassertPosition(win) {
  const entry = registeredBars.get(win.id)
  if (!entry) return
  setWorkArea(entry.hWnd, entry.barPx, entry.displayId)
}

function unregisterAppBar(win) {
  const entry = registeredBars.get(win.id)
  if (!entry) return

  const orig = originalWorkAreas.get(entry.displayId)
  if (orig) {
    settingWorkArea = true
    SystemParametersInfoW(SPI_SETWORKAREA, 0, orig, SPIF_SENDCHANGE)
    settingWorkArea = false
    originalWorkAreas.delete(entry.displayId)
  }

  registeredBars.delete(win.id)
  console.log(`[appbar] Unregistered window ${win.id}`)
}

function unregisterAll() {
  for (const [displayId, orig] of originalWorkAreas) {
    settingWorkArea = true
    SystemParametersInfoW(SPI_SETWORKAREA, 0, orig, SPIF_SENDCHANGE)
    settingWorkArea = false
    console.log(`[appbar] Restored work area for display ${displayId}`)
  }
  originalWorkAreas.clear()
  registeredBars.clear()
}

module.exports = {
  registerAppBar,
  unregisterAppBar,
  unregisterAll,
  reassertPosition,
  isSettingWorkArea,
}

const koffi = require('koffi')

const RECT = koffi.struct('RECT', {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long',
})

const APPBARDATA = koffi.struct('APPBARDATA', {
  cbSize: 'uint32',
  hWnd: 'uintptr_t',
  uCallbackMessage: 'uint32',
  uEdge: 'uint32',
  rc: RECT,
  lParam: 'intptr_t',
})

const shell32 = koffi.load('shell32.dll')
const user32 = koffi.load('user32.dll')

const SHAppBarMessage = shell32.func('__stdcall', 'SHAppBarMessage', 'uintptr_t', ['uint32', koffi.pointer(APPBARDATA)])
const SystemParametersInfoW = user32.func('__stdcall', 'SystemParametersInfoW', 'int', ['uint32', 'uint32', koffi.pointer(RECT), 'uint32'])

const ABM_NEW = 0x00
const ABM_REMOVE = 0x01
const ABM_QUERYPOS = 0x02
const ABM_SETPOS = 0x03
const ABE_TOP = 1

const ABN_STATECHANGE = 0x00
const ABN_POSCHANGED = 0x01
const ABN_FULLSCREENAPP = 0x02

const CALLBACK_MSG = 0x0401

const SPI_GETWORKAREA = 0x0030
const SPI_SETWORKAREA = 0x002F
const SPIF_SENDCHANGE = 0x02

const registeredBars = new Map()
const originalWorkAreas = new Map()

function getPhysicalRect(display, barHeightDIP) {
  const scale = display.scaleFactor
  return {
    left: Math.round(display.bounds.x * scale),
    top: Math.round(display.bounds.y * scale),
    right: Math.round((display.bounds.x + display.bounds.width) * scale),
    bottom: Math.round((display.bounds.y + barHeightDIP) * scale),
  }
}

function setWorkArea(display, barHeightDIP) {
  if (!originalWorkAreas.has(display.id)) {
    const original = { left: 0, top: 0, right: 0, bottom: 0 }
    SystemParametersInfoW(SPI_GETWORKAREA, 0, original, 0)
    originalWorkAreas.set(display.id, { ...original })
  }

  const scale = display.scaleFactor
  const { x, y, width, height } = display.bounds
  const workArea = {
    left: Math.round(x * scale),
    top: Math.round((y + barHeightDIP) * scale),
    right: Math.round((x + width) * scale),
    bottom: Math.round((y + height) * scale),
  }

  const result = SystemParametersInfoW(SPI_SETWORKAREA, 0, workArea, SPIF_SENDCHANGE)
  console.log(`[appbar] SetWorkArea display ${display.id}: top=${workArea.top}, result=${result}`)
  return result
}

function registerAppBar(win, display, barHeightDIP) {
  const hwndBuf = win.getNativeWindowHandle()
  const hWnd = hwndBuf.byteLength === 8
    ? Number(hwndBuf.readBigUInt64LE())
    : hwndBuf.readUInt32LE()

  const rc = getPhysicalRect(display, barHeightDIP)

  const abd = {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: hWnd,
    uCallbackMessage: CALLBACK_MSG,
    uEdge: ABE_TOP,
    rc: { ...rc },
    lParam: 0,
  }

  SHAppBarMessage(ABM_NEW, abd)
  abd.rc = { ...rc }
  SHAppBarMessage(ABM_QUERYPOS, abd)
  abd.uEdge = ABE_TOP
  abd.rc = { ...rc }
  SHAppBarMessage(ABM_SETPOS, abd)

  setWorkArea(display, barHeightDIP)

  registeredBars.set(win.id, { hWnd, display, barHeightDIP })
  console.log(`[appbar] Registered appbar on display ${display.id} (${rc.right - rc.left}x${rc.bottom - rc.top} physical px)`)
}

function reassertPosition(win) {
  const entry = registeredBars.get(win.id)
  if (!entry) return

  setWorkArea(entry.display, entry.barHeightDIP)

  const rc = getPhysicalRect(entry.display, entry.barHeightDIP)
  const abd = {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: entry.hWnd,
    uCallbackMessage: CALLBACK_MSG,
    uEdge: ABE_TOP,
    rc: { ...rc },
    lParam: 0,
  }
  SHAppBarMessage(ABM_QUERYPOS, abd)
  abd.uEdge = ABE_TOP
  abd.rc = { ...rc }
  SHAppBarMessage(ABM_SETPOS, abd)
}

function unregisterAppBar(win) {
  const entry = registeredBars.get(win.id)
  if (!entry) return

  const abd = {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: entry.hWnd,
    uCallbackMessage: 0,
    uEdge: 0,
    rc: { left: 0, top: 0, right: 0, bottom: 0 },
    lParam: 0,
  }

  SHAppBarMessage(ABM_REMOVE, abd)

  const original = originalWorkAreas.get(entry.display.id)
  if (original) {
    SystemParametersInfoW(SPI_SETWORKAREA, 0, original, SPIF_SENDCHANGE)
    originalWorkAreas.delete(entry.display.id)
  }

  registeredBars.delete(win.id)
  console.log(`[appbar] Unregistered appbar for window ${win.id}`)
}

function unregisterAll() {
  for (const [winId, entry] of registeredBars) {
    const abd = {
      cbSize: koffi.sizeof(APPBARDATA),
      hWnd: entry.hWnd,
      uCallbackMessage: 0,
      uEdge: 0,
      rc: { left: 0, top: 0, right: 0, bottom: 0 },
      lParam: 0,
    }
    SHAppBarMessage(ABM_REMOVE, abd)
    console.log(`[appbar] Cleanup: unregistered appbar ${winId}`)
  }
  registeredBars.clear()

  for (const [displayId, original] of originalWorkAreas) {
    SystemParametersInfoW(SPI_SETWORKAREA, 0, original, SPIF_SENDCHANGE)
    console.log(`[appbar] Restored work area for display ${displayId}`)
  }
  originalWorkAreas.clear()
}

module.exports = {
  registerAppBar,
  unregisterAppBar,
  unregisterAll,
  reassertPosition,
  CALLBACK_MSG,
  ABN_STATECHANGE,
  ABN_POSCHANGED,
  ABN_FULLSCREENAPP,
}

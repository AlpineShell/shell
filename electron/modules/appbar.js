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
const SHAppBarMessage = shell32.func('__stdcall', 'SHAppBarMessage', 'uintptr_t', ['uint32', koffi.pointer(APPBARDATA)])

const ABM_NEW = 0x00
const ABM_REMOVE = 0x01
const ABM_QUERYPOS = 0x02
const ABM_SETPOS = 0x03
const ABE_TOP = 1

const registeredBars = new Map()

/**
 * Register a BrowserWindow as an appbar at the top of a display.
 * This reserves screen work area so maximized windows won't overlap.
 *
 * @param {BrowserWindow} win - The topbar BrowserWindow
 * @param {Electron.Display} display - The display this bar belongs to
 * @param {number} barHeightDIP - The bar height in DIP (device-independent pixels)
 */
function registerAppBar(win, display, barHeightDIP) {
  const hwndBuf = win.getNativeWindowHandle()
  const hWnd = hwndBuf.byteLength === 8
    ? Number(hwndBuf.readBigUInt64LE())
    : hwndBuf.readUInt32LE()

  const scale = display.scaleFactor
  const physLeft = Math.round(display.bounds.x * scale)
  const physTop = Math.round(display.bounds.y * scale)
  const physRight = Math.round((display.bounds.x + display.bounds.width) * scale)
  const physBottom = Math.round((display.bounds.y + barHeightDIP) * scale)

  const abd = {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: hWnd,
    uCallbackMessage: 0x0401,
    uEdge: ABE_TOP,
    rc: { left: physLeft, top: physTop, right: physRight, bottom: physBottom },
    lParam: 0,
  }

  SHAppBarMessage(ABM_NEW, abd)

  SHAppBarMessage(ABM_QUERYPOS, abd)

  abd.uEdge = ABE_TOP
  abd.rc.left = physLeft
  abd.rc.top = physTop
  abd.rc.right = physRight
  abd.rc.bottom = physBottom
  SHAppBarMessage(ABM_SETPOS, abd)

  registeredBars.set(win.id, { hWnd, abd })
  console.log(`[appbar] Registered appbar on display ${display.id} (${physRight - physLeft}x${physBottom - physTop} physical px)`)
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
}

module.exports = { registerAppBar, unregisterAppBar, unregisterAll }

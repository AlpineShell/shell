const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')


const GetDC = user32.func('__stdcall', 'GetDC', 'uintptr_t', ['uintptr_t'])
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'int', ['uintptr_t', 'uintptr_t'])
const CreateCompatibleDC = gdi32.func('__stdcall', 'CreateCompatibleDC', 'uintptr_t', ['uintptr_t'])
const CreateCompatibleBitmap = gdi32.func('__stdcall', 'CreateCompatibleBitmap', 'uintptr_t', ['uintptr_t', 'int', 'int'])
const SelectObject = gdi32.func('__stdcall', 'SelectObject', 'uintptr_t', ['uintptr_t', 'uintptr_t'])
const BitBlt = gdi32.func('__stdcall', 'BitBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'uint32'])
const DeleteObject = gdi32.func('__stdcall', 'DeleteObject', 'int', ['uintptr_t'])
const DeleteDC = gdi32.func('__stdcall', 'DeleteDC', 'int', ['uintptr_t'])
const GetDIBits = gdi32.func('__stdcall', 'GetDIBits', 'int', ['uintptr_t', 'uintptr_t', 'uint32', 'uint32', 'void *', 'void *', 'uint32'])


const SetThreadDpiAwarenessContext = user32.func('__stdcall', 'SetThreadDpiAwarenessContext', 'intptr_t', ['intptr_t'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])


const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const IsZoomed = user32.func('__stdcall', 'IsZoomed', 'int', ['uintptr_t'])
const MonitorFromWindow = user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32'])


let DwmGetWindowAttribute = null
try {
  const dwmapi = koffi.load('dwmapi.dll')
  DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
} catch (_) {}

const TOP_BAR_HEIGHT = 24
const SAMPLE_COUNT = 5
const SRCCOPY = 0x00CC0020
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
const MONITOR_DEFAULTTONEAREST = 0x02
const DWMWA_CAPTION_COLOR = 35

let shellsRef = null
const lastColors = new Map()
const lastCaptionColors = new Map()

function withDpiAwareness(fn) {
  let old = null
  try { old = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) } catch (_) {}
  try { return fn() }
  finally { if (old) try { SetThreadDpiAwarenessContext(old) } catch (_) {} }
}

function getHwnd(win) {
  return win.getNativeWindowHandle().readUInt32LE(0)
}

function getMonitorHandle(hwnd) {
  const h = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)
  return typeof h === 'bigint' ? Number(h) : h
}


function getCaptionColor(hwnd) {
  if (!DwmGetWindowAttribute) return null
  const buf = Buffer.alloc(4)
  const hr = DwmGetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, buf, 4)
  if (hr !== 0) return null
  const val = buf.readUInt32LE(0)
  if (val >= 0xFFFFFFFE) return null
  return { r: val & 0xFF, g: (val >> 8) & 0xFF, b: (val >> 16) & 0xFF }
}


function isOwnWindow(hwnd) {
  if (!shellsRef) return false
  for (const shell of shellsRef.values()) {
    if (!shell.topBar.isDestroyed() && getHwnd(shell.topBar) === hwnd) return true
    if (!shell.desktop.isDestroyed() && getHwnd(shell.desktop) === hwnd) return true
  }
  return false
}


function sampleColorAt(physX, physY, physWidth) {
  if (physWidth <= 0) return null
  const screenDC = GetDC(0)
  if (!screenDC) return null

  const memDC = CreateCompatibleDC(screenDC)
  const bmp = CreateCompatibleBitmap(screenDC, physWidth, 1)
  const oldBmp = SelectObject(memDC, bmp)
  BitBlt(memDC, 0, 0, physWidth, 1, screenDC, physX, physY, SRCCOPY)

  try {
    const biHeader = Buffer.alloc(40)
    biHeader.writeUInt32LE(40, 0)
    biHeader.writeInt32LE(physWidth, 4)
    biHeader.writeInt32LE(-1, 8)
    biHeader.writeUInt16LE(1, 12)
    biHeader.writeUInt16LE(32, 14)

    const pixelData = Buffer.alloc(physWidth * 4)
    if (!GetDIBits(memDC, bmp, 0, 1, pixelData, biHeader, 0)) return null

    let totalR = 0, totalG = 0, totalB = 0, count = 0
    const samples = Math.min(SAMPLE_COUNT, physWidth)
    for (let i = 0; i < samples; i++) {
      const sx = Math.round((physWidth * (i + 1)) / (samples + 1))
      const off = sx * 4
      if (off + 2 >= pixelData.length) continue
      totalB += pixelData[off]
      totalG += pixelData[off + 1]
      totalR += pixelData[off + 2]
      count++
    }
    if (!count) return null
    return { r: Math.round(totalR / count), g: Math.round(totalG / count), b: Math.round(totalB / count) }
  } finally {
    SelectObject(memDC, oldBmp)
    DeleteObject(bmp)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

function getTopBarPhysBounds(topBarWin) {
  const hwnd = getHwnd(topBarWin)
  const buf = Buffer.alloc(16)
  GetWindowRect(hwnd, buf)
  return { left: buf.readInt32LE(0), top: buf.readInt32LE(4), right: buf.readInt32LE(8), bottom: buf.readInt32LE(12) }
}


function sampleDesktop(topBarWin, scaleFactor) {
  const b = getTopBarPhysBounds(topBarWin)
  return sampleColorAt(b.left, b.top + Math.round((TOP_BAR_HEIGHT + 2) * scaleFactor), b.right - b.left)
}


function getColorForDisplay(shell) {
  if (shell.topBar.isDestroyed()) return null
  const scaleFactor = shell.display.scaleFactor || 1
  const topBarMon = getMonitorHandle(getHwnd(shell.topBar))
  const displayId = shell.display.id

  const fgHwnd = GetForegroundWindow()

  if (fgHwnd && isOwnWindow(fgHwnd)) {
    const cached = lastCaptionColors.get(displayId)
    if (cached) return cached
  }

  if (fgHwnd && fgHwnd !== 0 && !isOwnWindow(fgHwnd) && IsZoomed(fgHwnd)) {
    if (getMonitorHandle(fgHwnd) === topBarMon) {
      const caption = getCaptionColor(fgHwnd)
      if (caption) {
        lastCaptionColors.set(displayId, caption)
        return caption
      }
    }
  }

  lastCaptionColors.delete(displayId)
  return sampleDesktop(shell.topBar, scaleFactor)
}

module.exports = {
  handlers: {
    'topbar/color': (event) => withDpiAwareness(() => {
      if (shellsRef) {
        for (const shell of shellsRef.values()) {
          if (!shell.topBar.isDestroyed() && shell.topBar.webContents === event.sender) {
            return getColorForDisplay(shell)
          }
        }
      }
      return null
    }),
  },

  setShells(shells) {
    shellsRef = shells
  },

  start(_broadcast) {
    setInterval(() => withDpiAwareness(() => {
      if (!shellsRef) return
      for (const [displayId, shell] of shellsRef) {
        if (shell.topBar.isDestroyed()) continue
        const color = getColorForDisplay(shell)
        if (!color) continue
        const last = lastColors.get(displayId)
        if (!last || color.r !== last.r || color.g !== last.g || color.b !== last.b) {
          lastColors.set(displayId, color)
          shell.topBar.webContents.send('topbar/color-changed', color)
        }
      }
    }), 100)
  },
}

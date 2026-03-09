const koffi = require('koffi')
const { screen } = require('electron')

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

const TOP_BAR_HEIGHT = 24
const SAMPLE_COUNT = 5
const SRCCOPY = 0x00CC0020
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4

let shellsRef = null
const lastColors = new Map()

function withDpiAwareness(fn) {
  let old = null
  try { old = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) } catch (_) {}
  try { return fn() }
  finally { if (old) try { SetThreadDpiAwarenessContext(old) } catch (_) {} }
}

function sampleColorAt(physX, physY, physWidth) {
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
    biHeader.writeUInt32LE(0, 16)

    const pixelData = Buffer.alloc(physWidth * 4)
    const result = GetDIBits(memDC, bmp, 0, 1, pixelData, biHeader, 0)
    if (!result) return null

    let totalR = 0, totalG = 0, totalB = 0, validSamples = 0

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const sampleX = Math.round((physWidth * (i + 1)) / (SAMPLE_COUNT + 1))
      const offset = sampleX * 4
      if (offset + 2 >= pixelData.length) continue

      totalB += pixelData[offset]
      totalG += pixelData[offset + 1]
      totalR += pixelData[offset + 2]
      validSamples++
    }

    if (validSamples === 0) return null

    return {
      r: Math.round(totalR / validSamples),
      g: Math.round(totalG / validSamples),
      b: Math.round(totalB / validSamples),
    }
  } finally {
    SelectObject(memDC, oldBmp)
    DeleteObject(bmp)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

function sampleForTopBar(topBarWin, scaleFactor) {
  const hwnd = topBarWin.getNativeWindowHandle().readUInt32LE(0)
  const rectBuf = Buffer.alloc(16)
  GetWindowRect(hwnd, rectBuf)

  const left = rectBuf.readInt32LE(0)
  const top = rectBuf.readInt32LE(4)
  const physWidth = rectBuf.readInt32LE(8) - left
  const physSampleY = top + Math.round((TOP_BAR_HEIGHT + 8) * scaleFactor)

  return sampleColorAt(left, physSampleY, physWidth)
}

function samplePrimaryFallback() {
  const primary = screen.getPrimaryDisplay()
  const sf = primary.scaleFactor || 1
  return sampleColorAt(
    Math.round(primary.bounds.x * sf),
    Math.round((TOP_BAR_HEIGHT + 8) * sf),
    Math.round(primary.bounds.width * sf)
  )
}

module.exports = {
  handlers: {
    'topbar/color': (event) => withDpiAwareness(() => {
      if (shellsRef) {
        for (const shell of shellsRef.values()) {
          if (!shell.topBar.isDestroyed() && shell.topBar.webContents === event.sender) {
            return sampleForTopBar(shell.topBar, shell.display.scaleFactor || 1)
          }
        }
      }
      return samplePrimaryFallback()
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

        const color = sampleForTopBar(shell.topBar, shell.display.scaleFactor || 1)
        if (!color) continue

        const last = lastColors.get(displayId)
        if (!last || color.r !== last.r || color.g !== last.g || color.b !== last.b) {
          lastColors.set(displayId, color)
          shell.topBar.webContents.send('topbar/color-changed', color)
        }
      }
    }), 500)
  },
}

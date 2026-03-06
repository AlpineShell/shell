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

const TOP_BAR_HEIGHT = 24
const SAMPLE_COUNT = 5
const SRCCOPY = 0x00CC0020
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4

let lastColor = null

function sampleTopBarColor() {
  const primary = screen.getPrimaryDisplay()
  const scaleFactor = primary.scaleFactor || 1

  const physX = Math.round(primary.bounds.x * scaleFactor)
  const physWidth = Math.round(primary.bounds.width * scaleFactor)
  const physSampleY = Math.round((TOP_BAR_HEIGHT + 8) * scaleFactor)

  let oldContext = null
  try {
    oldContext = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
  } catch (_) {}

  const screenDC = GetDC(0)
  if (!screenDC) {
    if (oldContext) try { SetThreadDpiAwarenessContext(oldContext) } catch (_) {}
    return null
  }

  const memDC = CreateCompatibleDC(screenDC)
  const bmp = CreateCompatibleBitmap(screenDC, physWidth, 1)
  const oldBmp = SelectObject(memDC, bmp)

  BitBlt(memDC, 0, 0, physWidth, 1, screenDC, physX, physSampleY, SRCCOPY)

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

      const b = pixelData[offset]
      const g = pixelData[offset + 1]
      const r = pixelData[offset + 2]

      totalB += b
      totalG += g
      totalR += r
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
    if (oldContext) try { SetThreadDpiAwarenessContext(oldContext) } catch (_) {}
  }
}

module.exports = {
  handlers: {
    'topbar/color': () => sampleTopBarColor(),
  },

  start(broadcast) {
    setInterval(() => {
      const color = sampleTopBarColor()
      if (!color) return

      if (!lastColor || color.r !== lastColor.r || color.g !== lastColor.g || color.b !== lastColor.b) {
        lastColor = color
        broadcast('topbar/color-changed', color)
      }
    }, 500)
  },
}

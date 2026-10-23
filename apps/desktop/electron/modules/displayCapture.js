const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')

const GetDC = user32.func('__stdcall', 'GetDC', 'uintptr_t', ['uintptr_t'])
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'int', ['uintptr_t', 'uintptr_t'])
const CreateCompatibleDC = gdi32.func('__stdcall', 'CreateCompatibleDC', 'uintptr_t', ['uintptr_t'])
const CreateCompatibleBitmap = gdi32.func('__stdcall', 'CreateCompatibleBitmap', 'uintptr_t', ['uintptr_t', 'int', 'int'])
const SelectObject = gdi32.func('__stdcall', 'SelectObject', 'uintptr_t', ['uintptr_t', 'uintptr_t'])
const DeleteObject = gdi32.func('__stdcall', 'DeleteObject', 'int', ['uintptr_t'])
const DeleteDC = gdi32.func('__stdcall', 'DeleteDC', 'int', ['uintptr_t'])
const GetDIBits = gdi32.func('__stdcall', 'GetDIBits', 'int', ['uintptr_t', 'uintptr_t', 'uint32', 'uint32', 'void *', 'void *', 'uint32'])
const BitBlt = gdi32.func('__stdcall', 'BitBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'uint32'])

const SRCCOPY = 0x00CC0020
const CAPTUREBLT = 0x40000000
const BITMAPINFOHEADER_BYTES = 40

function bitmapInfoHeader(width, height) {
  const header = Buffer.alloc(BITMAPINFOHEADER_BYTES)
  header.writeUInt32LE(BITMAPINFOHEADER_BYTES, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(-height, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  return header
}

function makeOpaque(pixels) {
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
}

function physicalBounds(display) {
  const { screen } = require('electron')
  return screen.dipToScreenRect(null, display.bounds)
}

function captureDisplay(display) {
  const { x, y, width, height } = physicalBounds(display)
  if (width <= 0 || height <= 0) return null

  const screenDC = GetDC(0)
  if (!screenDC) return null
  const memDC = CreateCompatibleDC(screenDC)
  const bitmap = CreateCompatibleBitmap(screenDC, width, height)
  const previousBitmap = SelectObject(memDC, bitmap)

  try {
    if (!BitBlt(memDC, 0, 0, width, height, screenDC, x, y, SRCCOPY | CAPTUREBLT)) return null
    SelectObject(memDC, previousBitmap)

    const pixels = Buffer.alloc(width * height * 4)
    if (!GetDIBits(screenDC, bitmap, 0, height, pixels, bitmapInfoHeader(width, height), 0)) return null
    makeOpaque(pixels)

    const { nativeImage } = require('electron')
    return nativeImage.createFromBitmap(pixels, { width, height })
  } finally {
    SelectObject(memDC, previousBitmap)
    DeleteObject(bitmap)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

module.exports = { captureDisplay }

const koffi = require('koffi')
const windowCapturePolicy = require('./windowCapturePolicy')

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')

const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const IsHungAppWindow = user32.func('__stdcall', 'IsHungAppWindow', 'int', ['uintptr_t'])
const PrintWindow = user32.func('__stdcall', 'PrintWindow', 'int', ['uintptr_t', 'uintptr_t', 'uint32'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const GetDC = user32.func('__stdcall', 'GetDC', 'uintptr_t', ['uintptr_t'])
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'int', ['uintptr_t', 'uintptr_t'])
const CreateCompatibleDC = gdi32.func('__stdcall', 'CreateCompatibleDC', 'uintptr_t', ['uintptr_t'])
const CreateCompatibleBitmap = gdi32.func('__stdcall', 'CreateCompatibleBitmap', 'uintptr_t', ['uintptr_t', 'int', 'int'])
const SelectObject = gdi32.func('__stdcall', 'SelectObject', 'uintptr_t', ['uintptr_t', 'uintptr_t'])
const DeleteObject = gdi32.func('__stdcall', 'DeleteObject', 'int', ['uintptr_t'])
const DeleteDC = gdi32.func('__stdcall', 'DeleteDC', 'int', ['uintptr_t'])
const GetDIBits = gdi32.func('__stdcall', 'GetDIBits', 'int', ['uintptr_t', 'uintptr_t', 'uint32', 'uint32', 'void *', 'void *', 'uint32'])
const BitBlt = gdi32.func('__stdcall', 'BitBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'uint32'])
const StretchBlt = gdi32.func('__stdcall', 'StretchBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'int', 'int', 'uint32'])
const SetStretchBltMode = gdi32.func('__stdcall', 'SetStretchBltMode', 'int', ['uintptr_t', 'int'])
const SetBrushOrgEx = gdi32.func('__stdcall', 'SetBrushOrgEx', 'int', ['uintptr_t', 'int', 'int', 'void *'])

const SRCCOPY = 0x00CC0020
const HALFTONE = 4
const PW_RENDERFULLCONTENT = 2

function printWindowInto(hwnd, memDC) {
  if (IsHungAppWindow(hwnd)) return false
  return Boolean(PrintWindow(hwnd, memDC, PW_RENDERFULLCONTENT) || PrintWindow(hwnd, memDC, 0))
}

function readPixels(screenDC, bitmap, width, height) {
  const pixels = Buffer.alloc(width * height * 4)
  if (!GetDIBits(screenDC, bitmap, 0, height, pixels, windowCapturePolicy.bitmapInfoHeader(width, height), 0)) return null
  return pixels
}

function captureWindow({ hwnd, allowScreenCopy, maxWidth, maxHeight }) {
  if (IsIconic(hwnd)) return null

  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null
  const left = rect.readInt32LE(0)
  const top = rect.readInt32LE(4)
  const srcWidth = rect.readInt32LE(8) - left
  const srcHeight = rect.readInt32LE(12) - top
  if (srcWidth <= 0 || srcHeight <= 0) return null

  const { width, height } = windowCapturePolicy.thumbnailSize(srcWidth, srcHeight, maxWidth, maxHeight)

  const screenDC = GetDC(0)
  if (!screenDC) return null
  const memDC = CreateCompatibleDC(screenDC)
  const bmp = CreateCompatibleBitmap(screenDC, srcWidth, srcHeight)
  const oldBmp = SelectObject(memDC, bmp)
  const thumbDC = CreateCompatibleDC(screenDC)
  const thumbBmp = CreateCompatibleBitmap(screenDC, width, height)
  const oldThumbBmp = SelectObject(thumbDC, thumbBmp)

  try {
    const printed = printWindowInto(hwnd, memDC)
    if (!printed && !allowScreenCopy) return null
    if (!printed) BitBlt(memDC, 0, 0, srcWidth, srcHeight, screenDC, left, top, SRCCOPY)

    SetStretchBltMode(thumbDC, HALFTONE)
    SetBrushOrgEx(thumbDC, 0, 0, null)
    if (!StretchBlt(thumbDC, 0, 0, width, height, memDC, 0, 0, srcWidth, srcHeight, SRCCOPY)) return null
    SelectObject(thumbDC, oldThumbBmp)

    const pixels = readPixels(screenDC, thumbBmp, width, height)
    if (!pixels) return null
    windowCapturePolicy.makeOpaque(pixels)
    return { width, height, pixels }
  } finally {
    SelectObject(thumbDC, oldThumbBmp)
    DeleteObject(thumbBmp)
    DeleteDC(thumbDC)
    SelectObject(memDC, oldBmp)
    DeleteObject(bmp)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

function captureScreenRect({ left, top, width, height }) {
  if (width <= 0 || height <= 0) return null
  const screenDC = GetDC(0)
  if (!screenDC) return null
  const memDC = CreateCompatibleDC(screenDC)
  const bmp = CreateCompatibleBitmap(screenDC, width, height)
  const old = SelectObject(memDC, bmp)

  try {
    if (!BitBlt(memDC, 0, 0, width, height, screenDC, left, top, SRCCOPY)) return null
    SelectObject(memDC, old)
    const pixels = readPixels(screenDC, bmp, width, height)
    return pixels ? { width, height, pixels } : null
  } finally {
    SelectObject(memDC, old)
    DeleteObject(bmp)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

const CAPTURES = {
  window: captureWindow,
  'screen-rect': captureScreenRect,
}

process.parentPort.on('message', (event) => {
  const request = event && event.data
  if (!request || typeof request.id !== 'number') return
  const capture = CAPTURES[request.kind]
  try {
    process.parentPort.postMessage({ id: request.id, image: capture ? capture(request) : null })
  } catch (e) {
    process.parentPort.postMessage({ id: request.id, image: null, error: (e && e.message) || String(e) })
  }
})

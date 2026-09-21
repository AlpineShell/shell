const DI_NORMAL = 0x3
const BITMAPINFOHEADER_BYTES = 40

let bindings = null

function loadBindings() {
  if (bindings) return bindings
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  const gdi32 = koffi.load('gdi32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  bindings = {
    DrawIconEx: user32.func('__stdcall', 'DrawIconEx', 'int', ['uintptr_t', 'int', 'int', 'uintptr_t', 'int', 'int', 'uint32', 'uintptr_t', 'uint32']),
    RtlMoveMemory: kernel32.func('__stdcall', 'RtlMoveMemory', 'void', ['void *', 'uintptr_t', 'uintptr_t']),
    CreateCompatibleDC: gdi32.func('__stdcall', 'CreateCompatibleDC', 'uintptr_t', ['uintptr_t']),
    CreateDIBSection: gdi32.func('__stdcall', 'CreateDIBSection', 'uintptr_t', ['uintptr_t', 'void *', 'uint32', 'void *', 'uintptr_t', 'uint32']),
    SelectObject: gdi32.func('__stdcall', 'SelectObject', 'uintptr_t', ['uintptr_t', 'uintptr_t']),
    DeleteObject: gdi32.func('__stdcall', 'DeleteObject', 'int', ['uintptr_t']),
    DeleteDC: gdi32.func('__stdcall', 'DeleteDC', 'int', ['uintptr_t']),
    GdiFlush: gdi32.func('__stdcall', 'GdiFlush', 'int', []),
  }
  return bindings
}

function topDownBitmapInfo(size) {
  const bmi = Buffer.alloc(BITMAPINFOHEADER_BYTES)
  bmi.writeUInt32LE(BITMAPINFOHEADER_BYTES, 0)
  bmi.writeInt32LE(size, 4)
  bmi.writeInt32LE(-size, 8)
  bmi.writeUInt16LE(1, 12)
  bmi.writeUInt16LE(32, 14)
  return bmi
}

function hasVisiblePixels(pixels) {
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) return true
  }
  return false
}

function iconHandleToDataUrl(hIcon, size) {
  if (!hIcon) return ''
  const native = loadBindings()
  const ppvBits = Buffer.alloc(8)
  const hbm = native.CreateDIBSection(0, topDownBitmapInfo(size), 0, ppvBits, 0, 0)
  if (!hbm) return ''
  const bitsAddr = ppvBits.readBigUInt64LE(0)
  const memDC = native.CreateCompatibleDC(0)
  const old = native.SelectObject(memDC, hbm)
  try {
    native.DrawIconEx(memDC, 0, 0, hIcon, size, size, 0, 0, DI_NORMAL)
    native.GdiFlush()
    const pixels = Buffer.alloc(size * size * 4)
    native.RtlMoveMemory(pixels, bitsAddr, BigInt(pixels.length))
    if (!hasVisiblePixels(pixels)) return ''
    const { nativeImage } = require('electron')
    return nativeImage.createFromBitmap(pixels, { width: size, height: size }).toDataURL()
  } catch {
    return ''
  } finally {
    native.SelectObject(memDC, old)
    native.DeleteObject(hbm)
    native.DeleteDC(memDC)
  }
}

module.exports = { iconHandleToDataUrl }

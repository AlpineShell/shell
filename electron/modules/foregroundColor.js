const koffi = require('koffi')
const { screen } = require('electron')

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const IsZoomed = user32.func('__stdcall', 'IsZoomed', 'int', ['uintptr_t'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const GetDC = user32.func('__stdcall', 'GetDC', 'uintptr_t', ['uintptr_t'])
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'int', ['uintptr_t', 'uintptr_t'])
const GetPixel = gdi32.func('__stdcall', 'GetPixel', 'uint32', ['uintptr_t', 'int', 'int'])
const CreateCompatibleDC = gdi32.func('__stdcall', 'CreateCompatibleDC', 'uintptr_t', ['uintptr_t'])
const CreateCompatibleBitmap = gdi32.func('__stdcall', 'CreateCompatibleBitmap', 'uintptr_t', ['uintptr_t', 'int', 'int'])
const SelectObject = gdi32.func('__stdcall', 'SelectObject', 'uintptr_t', ['uintptr_t', 'uintptr_t'])
const BitBlt = gdi32.func('__stdcall', 'BitBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'uint32'])
const DeleteDC = gdi32.func('__stdcall', 'DeleteDC', 'int', ['uintptr_t'])
const DeleteObject = gdi32.func('__stdcall', 'DeleteObject', 'int', ['uintptr_t'])
const GetDpiForWindow = user32.func('__stdcall', 'GetDpiForWindow', 'uint32', ['uintptr_t'])

const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])

const SRCCOPY = 0x00CC0020

let altTab = null
try { altTab = require('./altTab') } catch (_) {}

const perDisplay = new Map()
const pendingDisplay = new Map()
const hwndPerDisplay = new Map()

function colorEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function sampleTitleBarColor(hwnd) {
  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null

  const left = rect.readInt32LE(0)
  const top = rect.readInt32LE(4)
  const right = rect.readInt32LE(8)
  const width = right - left
  if (width <= 0) return null

  let dpi = 96
  try { dpi = GetDpiForWindow(hwnd) || 96 } catch (_) {}
  const scale = dpi / 96
  const barPx = Math.round(24 * scale)
  const titleBarCenter = top + barPx + Math.round(15 * scale)

  const centerX = left + Math.floor(width / 2)
  const stripW = 21

  const screenDC = GetDC(0)
  if (!screenDC) return null

  const memDC = CreateCompatibleDC(screenDC)
  const bmp = CreateCompatibleBitmap(screenDC, stripW, 1)
  const old = SelectObject(memDC, bmp)

  BitBlt(memDC, 0, 0, stripW, 1, screenDC, centerX - 10, titleBarCenter, SRCCOPY)

  let totalR = 0, totalG = 0, totalB = 0, count = 0
  for (let x = 0; x <= 20; x += 5) {
    const pixel = GetPixel(memDC, x, 0)
    if (pixel !== 0xFFFFFFFF) {
      totalR += pixel & 0xFF
      totalG += (pixel >> 8) & 0xFF
      totalB += (pixel >> 16) & 0xFF
      count++
    }
  }

  SelectObject(memDC, old)
  DeleteObject(bmp)
  DeleteDC(memDC)
  ReleaseDC(0, screenDC)

  if (count === 0) return null

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  }
}

function getDisplayIdForWindow(hwnd) {
  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null
  const left = rect.readInt32LE(0)
  const top = rect.readInt32LE(4)
  const right = rect.readInt32LE(8)
  const bottom = rect.readInt32LE(12)
  const display = screen.getDisplayNearestPoint({
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  })
  return display.id
}

function clearDisplay(displayId, broadcast) {
  hwndPerDisplay.delete(displayId)
  pendingDisplay.delete(displayId)
  if (perDisplay.has(displayId)) {
    perDisplay.delete(displayId)
    broadcast('topbar/fg-color-changed', { displayId })
  }
}

function update(broadcast) {
  if (altTab && altTab.isSwitcherActive()) return

  for (const [displayId, trackedHwnd] of [...hwndPerDisplay.entries()]) {
    if (!trackedHwnd || !IsZoomed(trackedHwnd)) {
      clearDisplay(displayId, broadcast)
    }
  }

  const hwnd = GetForegroundWindow()
  if (!hwnd || !IsZoomed(hwnd)) return

  const displayId = getDisplayIdForWindow(hwnd)
  if (displayId == null) return

  hwndPerDisplay.set(displayId, hwnd)

  const rgb = sampleTitleBarColor(hwnd)
  if (!rgb) {
    clearDisplay(displayId, broadcast)
    return
  }

  const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
  const color = { r: rgb.r, g: rgb.g, b: rgb.b, darkText: lum > 128 }
  const pending = pendingDisplay.get(displayId)

  if (!colorEqual(pending, color)) {
    pendingDisplay.set(displayId, color)
    return
  }

  const prev = perDisplay.get(displayId)
  if (!colorEqual(prev, color)) {
    perDisplay.set(displayId, color)
    broadcast('topbar/fg-color-changed', { ...color, displayId })
  }
}

module.exports = {
  handlers: {
    'topbar/fg-color': () => {
      const result = []
      for (const [displayId, color] of perDisplay) {
        result.push({ ...color, displayId })
      }
      return result
    },
  },
  start(broadcast) {
    setInterval(() => update(broadcast), 300)
  },
}

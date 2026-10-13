const koffi = require('koffi')
const shellSurfaces = require('./shellSurfaces')

const user32 = koffi.load('user32.dll')

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])

let preferredDisplayIdProvider = null

function setPreferredDisplayProvider(provider) {
  preferredDisplayIdProvider = typeof provider === 'function' ? provider : null
}

function preferredDisplay(screen) {
  if (!preferredDisplayIdProvider) return null
  const id = preferredDisplayIdProvider()
  if (id == null) return null
  return screen.getAllDisplays().find((display) => display.id === id) ?? null
}

function windowCenter(hwnd) {
  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null
  const left = rect.readInt32LE(0)
  const top = rect.readInt32LE(4)
  const right = rect.readInt32LE(8)
  const bottom = rect.readInt32LE(12)
  if (right <= left || bottom <= top) return null
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) }
}

function toDipPoint(screen, screenPoint) {
  try {
    return screen.screenToDipPoint(screenPoint)
  } catch {
    return screenPoint
  }
}

function containsPoint(bounds, point) {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height
}

function foregroundWindowDisplay(screen) {
  const raw = GetForegroundWindow()
  const hwnd = typeof raw === 'bigint' ? Number(raw) : raw
  if (!hwnd || shellSurfaces.isShellSurface(hwnd) || IsIconic(hwnd)) return null
  const center = windowCenter(hwnd)
  if (!center) return null
  const centerDip = toDipPoint(screen, center)
  return screen.getAllDisplays().find((display) => containsPoint(display.bounds, centerDip)) ?? screen.getDisplayNearestPoint(centerDip)
}

function currentDisplay() {
  const { screen } = require('electron')
  return preferredDisplay(screen)
    ?? foregroundWindowDisplay(screen)
    ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

module.exports = { setPreferredDisplayProvider, currentDisplay }

const koffi = require('koffi')

const user32 = koffi.load('user32.dll')

const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int'])
const SetWindowLongW = user32.func('__stdcall', 'SetWindowLongW', 'int32', ['uintptr_t', 'int', 'int32'])

const GWL_STYLE = -16
const WS_SYSMENU = 0x00080000

function enableSystemMenu(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return
  try {
    const hwnd = browserWindow.getNativeWindowHandle().readUInt32LE(0)
    const style = GetWindowLongW(hwnd, GWL_STYLE)
    if (style & WS_SYSMENU) return
    SetWindowLongW(hwnd, GWL_STYLE, style | WS_SYSMENU)
  } catch (e) {
    console.error('[windowSystemMenu] enable failed:', e.message)
  }
}

module.exports = { enableSystemMenu }

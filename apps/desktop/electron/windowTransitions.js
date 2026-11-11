const DWMWA_TRANSITIONS_FORCEDISABLED = 3

let dwmSetWindowAttribute

function loadDwmSetWindowAttribute() {
  if (dwmSetWindowAttribute !== undefined) return dwmSetWindowAttribute
  try {
    const koffi = require('koffi')
    const dwmapi = koffi.load('dwmapi.dll')
    dwmSetWindowAttribute = dwmapi.func('__stdcall', 'DwmSetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
  } catch {
    dwmSetWindowAttribute = null
  }
  return dwmSetWindowAttribute
}

function disableWindowTransitions(win) {
  const setAttribute = loadDwmSetWindowAttribute()
  if (!setAttribute || !win || win.isDestroyed()) return false
  try {
    const hwnd = win.getNativeWindowHandle().readUInt32LE(0)
    const disabled = Buffer.alloc(4)
    disabled.writeInt32LE(1, 0)
    return setAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, disabled, 4) === 0
  } catch {
    return false
  }
}

module.exports = { disableWindowTransitions }

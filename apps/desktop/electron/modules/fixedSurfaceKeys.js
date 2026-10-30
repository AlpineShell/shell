const keyState = require('./keyState')
const winFocus = require('./winFocus')
const windowEnum = require('./windowEnum')
const { isExposedOwnWindow } = require('./exposedOwnWindows')
const { holdsWindowArrangementKey } = require('./fixedSurfaceKeyPolicy')

let arrangeableOwnWindowsProvider = null

function setArrangeableOwnWindows(provider) {
  arrangeableOwnWindowsProvider = typeof provider === 'function' ? provider : null
}

function describeForegroundWindow() {
  const hwnd = winFocus.getForegroundWindow()
  if (!hwnd) return { exists: false, ownProcess: false, arrangeable: false }
  return {
    exists: true,
    ownProcess: windowEnum.windowProcessId(hwnd) === process.pid,
    arrangeable: isExposedOwnWindow(hwnd, arrangeableOwnWindowsProvider),
  }
}

function handleKey(keyEvent) {
  if (!keyEvent.isKeyDown) return false
  return holdsWindowArrangementKey(keyEvent.vkCode, keyState, describeForegroundWindow)
}

module.exports = { setArrangeableOwnWindows, handleKey }

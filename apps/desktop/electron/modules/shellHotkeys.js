const keyState = require('./keyState')
const { shortcutForKey, createWinTapTracker } = require('./shellHotkeyPolicy')

const WIN_TAP = 'winTap'

const actionCallbacks = new Map()
const winTapTracker = createWinTapTracker()
let winTapEnabled = false

function on(action, callback) {
  actionCallbacks.set(action, callback)
}

function setWinTapEnabled(enabled) {
  winTapEnabled = Boolean(enabled)
  if (!winTapEnabled) winTapTracker.reset()
}

function runAction(action, callback, payload) {
  try {
    return callback(payload)
  } catch (e) {
    console.error(`[shellHotkeys] ${action} error:`, e.message)
    return false
  }
}

function runAfterKey(action, callback, payload, releasesWinKey) {
  setImmediate(() => {
    if (releasesWinKey) keyState.releaseWinKeys()
    runAction(action, callback, payload)
  })
}

function handleWinTap(keyEvent) {
  if (!winTapEnabled) return false
  if (!winTapTracker.observe(keyEvent, keyState.isKeyHeld)) return false
  const callback = actionCallbacks.get(WIN_TAP)
  if (!callback) return false
  runAfterKey(WIN_TAP, callback, undefined, true)
  return true
}

function handleShortcut(keyEvent) {
  if (!keyEvent.isKeyDown) return false
  const shortcut = shortcutForKey(keyEvent.vkCode, keyState)
  if (!shortcut) return false
  const callback = actionCallbacks.get(shortcut.action)
  if (!callback) return false
  if (shortcut.inline) return Boolean(runAction(shortcut.action, callback, shortcut))
  runAfterKey(shortcut.action, callback, shortcut, shortcut.releasesWinKey)
  return true
}

module.exports = { on, setWinTapEnabled, handleWinTap, handleShortcut }

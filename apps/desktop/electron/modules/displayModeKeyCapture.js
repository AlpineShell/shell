const keyState = require('./keyState')
const { displayModeKeyAction } = require('./displayModePolicy')
const { createKeyCapture } = require('./keyCapturePolicy')

let keyCallback = null

const capture = createKeyCapture({
  repeatsHeldKeys: false,
  decideKey({ vkCode }) {
    const { action, swallow } = displayModeKeyAction(vkCode, keyState.isShiftHeld())
    return { swallow, action: action === 'ignore' ? null : action }
  },
})

function handleDisplayModeKey(keyEvent) {
  const { swallow, action } = capture.handleKey(keyEvent)
  if (action && keyCallback) {
    setImmediate(() => {
      try { keyCallback(action) } catch (e) { console.error('[displayModeKeyCapture] key error:', e.message) }
    })
  }
  return swallow
}

module.exports = {
  setActive: capture.setActive,
  handleKey: handleDisplayModeKey,
  onKey(callback) {
    keyCallback = callback
  },
}

const {
  VK_BACK,
  VK_TAB,
  VK_RETURN,
  VK_ESCAPE,
  VK_LEFT,
  VK_UP,
  VK_RIGHT,
  VK_DOWN,
  isWinKey,
} = require('./virtualKeys')

const EMOJI_NAVIGATION_KEYS = new Map([
  [VK_ESCAPE, 'escape'],
  [VK_RETURN, 'enter'],
  [VK_BACK, 'backspace'],
  [VK_LEFT, 'left'],
  [VK_RIGHT, 'right'],
  [VK_UP, 'up'],
  [VK_DOWN, 'down'],
])

const PASS_THROUGH = Object.freeze({ swallow: false, action: null })

function emojiKeyMessage(vkCode, translateChar) {
  const navigation = EMOJI_NAVIGATION_KEYS.get(vkCode)
  if (navigation) return { kind: navigation }
  if (vkCode === VK_TAB || isWinKey(vkCode)) return null
  const char = translateChar(vkCode)
  return char ? { kind: 'char', value: char } : null
}

function createKeyCapture({ decideKey, repeatsHeldKeys }) {
  const swallowedKeys = new Set()
  let active = false

  function setActive(next) {
    active = Boolean(next)
    if (active) swallowedKeys.clear()
  }

  function isActive() {
    return active
  }

  function handleKey(keyEvent) {
    if (keyEvent.isKeyUp) return { swallow: swallowedKeys.delete(keyEvent.vkCode), action: null }
    if (!keyEvent.isKeyDown || !active) return PASS_THROUGH
    if (!repeatsHeldKeys && swallowedKeys.has(keyEvent.vkCode)) return { swallow: true, action: null }
    const { swallow, action } = decideKey(keyEvent)
    if (swallow) swallowedKeys.add(keyEvent.vkCode)
    return { swallow, action }
  }

  return { setActive, isActive, handleKey }
}

module.exports = { emojiKeyMessage, createKeyCapture }

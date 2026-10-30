const { VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN, VK_F4 } = require('./virtualKeys')

const ARROW_KEYS = new Set([VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN])

function isWindowArrangementKey(vkCode, modifiers) {
  if (ARROW_KEYS.has(vkCode)) return modifiers.isWinHeld() && !modifiers.isCtrlHeld()
  if (vkCode === VK_F4) return modifiers.isAltHeld() && !modifiers.isWinHeld() && !modifiers.isCtrlHeld()
  return false
}

function isFixedShellSurface(target) {
  if (!target || !target.exists) return false
  return target.ownProcess && !target.arrangeable
}

function holdsWindowArrangementKey(vkCode, modifiers, describeForeground) {
  if (!isWindowArrangementKey(vkCode, modifiers)) return false
  return isFixedShellSurface(describeForeground())
}

module.exports = { isWindowArrangementKey, isFixedShellSurface, holdsWindowArrangementKey }

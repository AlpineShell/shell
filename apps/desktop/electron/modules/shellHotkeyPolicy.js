const { isWinKey } = require('./virtualKeys')
const { buildShellShortcuts } = require('./shellShortcutBindings')

const SHELL_SHORTCUTS = Object.freeze(buildShellShortcuts())

function modifierMatches(required, isHeld) {
  return required === undefined || required === isHeld()
}

function shortcutForKey(vkCode, modifiers, shortcuts = SHELL_SHORTCUTS) {
  const candidates = shortcuts.filter((shortcut) => shortcut.vkCode === vkCode)
  return candidates.find((shortcut) =>
    modifierMatches(shortcut.win, modifiers.isWinHeld)
    && modifierMatches(shortcut.ctrl, modifiers.isCtrlHeld)
    && modifierMatches(shortcut.alt, modifiers.isAltHeld)
    && modifierMatches(shortcut.shift, modifiers.isShiftHeld)
  ) ?? null
}

function createWinTapTracker() {
  let winDown = false
  let tapPending = false

  function observe({ vkCode, isKeyDown, isKeyUp }, isKeyHeld) {
    if (!isWinKey(vkCode)) {
      if (isKeyDown && winDown) tapPending = false
      return false
    }
    if (isKeyDown && !winDown) {
      winDown = true
      tapPending = true
      return false
    }
    if (!isKeyUp) return false
    const tapped = tapPending && isKeyHeld(vkCode)
    winDown = false
    tapPending = false
    return tapped
  }

  function reset() {
    winDown = false
    tapPending = false
  }

  return { observe, reset }
}

module.exports = { SHELL_SHORTCUTS, shortcutForKey, createWinTapTracker }

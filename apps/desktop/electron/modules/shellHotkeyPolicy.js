const {
  VK_LEFT,
  VK_UP,
  VK_RIGHT,
  VK_DOWN,
  VK_E,
  VK_I,
  VK_M,
  VK_P,
  VK_S,
  VK_ESCAPE,
  VK_OEM_PERIOD,
  isWinKey,
} = require('./virtualKeys')

const TILE_DIRECTIONS = [
  [VK_LEFT, 'left'],
  [VK_UP, 'up'],
  [VK_RIGHT, 'right'],
  [VK_DOWN, 'down'],
]

const TILE_SHORTCUTS = TILE_DIRECTIONS.flatMap(([vkCode, direction]) => [
  { action: 'tile', vkCode, win: true, shift: false, direction, inline: true },
  { action: 'tile', vkCode, win: true, shift: true, direction, inline: true },
])

const SHELL_SHORTCUTS = Object.freeze([
  ...TILE_SHORTCUTS,
  { action: 'openFileExplorer', vkCode: VK_E, win: true },
  { action: 'openSettings', vkCode: VK_I, win: true },
  { action: 'openEmojiPicker', vkCode: VK_OEM_PERIOD, win: true, releasesWinKey: true },
  { action: 'openDisplayModePicker', vkCode: VK_P, win: true },
  { action: 'takeScreenshot', vkCode: VK_S, win: true, shift: true },
  { action: 'minimizeAll', vkCode: VK_M, win: true, shift: false },
  { action: 'restoreMinimized', vkCode: VK_M, win: true, shift: true },
  { action: 'cancelScreenshot', vkCode: VK_ESCAPE, inline: true },
])

function modifierMatches(required, isHeld) {
  return required === undefined || required === isHeld()
}

function shortcutForKey(vkCode, modifiers, shortcuts = SHELL_SHORTCUTS) {
  const candidates = shortcuts.filter((shortcut) => shortcut.vkCode === vkCode)
  return candidates.find((shortcut) =>
    modifierMatches(shortcut.win, modifiers.isWinHeld) && modifierMatches(shortcut.shift, modifiers.isShiftHeld)
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

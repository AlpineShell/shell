function isCrossDisplayMove(direction, shift) {
  return !!shift && (direction === 'left' || direction === 'right')
}

function allowsWindow(target) {
  if (!target || !target.exists) return false
  if (!target.ownProcess) return true
  return !!target.exposed
}

function snapHotkeyConfigured(config, direction, shift) {
  if (!config || !config.enabled || !config.hotkeys || config.mode !== 'snap') return false
  if (shift && !isCrossDisplayMove(direction, shift)) return false
  return true
}

function acceptsSnapHotkey(config, direction, shift, target) {
  if (!snapHotkeyConfigured(config, direction, shift)) return false
  if (!allowsWindow(target)) return false
  if (isCrossDisplayMove(direction, shift) && !target.hasNeighborDisplay) return false
  return true
}

module.exports = { isCrossDisplayMove, allowsWindow, snapHotkeyConfigured, acceptsSnapHotkey }

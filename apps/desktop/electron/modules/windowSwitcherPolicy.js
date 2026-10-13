const { VK_TAB, VK_ESCAPE, isAltKey } = require('./virtualKeys')

const THUMBNAIL_STALE_MS = 30000
const WS_EX_TOOLWINDOW = 0x00000080

function initialSelection(windowCount, pendingSteps) {
  if (windowCount <= 0) return 0
  const start = windowCount > 1 ? 1 : 0
  return (((start + pendingSteps) % windowCount) + windowCount) % windowCount
}

function planSwitcherAfterBuild({ isLatestBuild, windowCount, altHeld, pendingSteps }) {
  if (!isLatestBuild || windowCount === 0) return { action: 'drop' }
  const index = initialSelection(windowCount, pendingSteps)
  return { action: altHeld ? 'show' : 'switch', index }
}

function isThumbnailStale(entry, now, maxAgeMs = THUMBNAIL_STALE_MS) {
  return !entry || now - entry.ts >= maxAgeMs
}

function isSwitcherWindow(hwnd, probe) {
  if (!probe.isVisible(hwnd)) return false
  if ((probe.exStyle(hwnd) & WS_EX_TOOLWINDOW) !== 0) return false
  if (probe.isCloaked(hwnd)) return false
  if (probe.titleLength(hwnd) <= 0) return false
  if (probe.isShellSurface(hwnd) || probe.isShellWindow(hwnd)) return false
  return !probe.isOwnProcess(hwnd) || probe.isExposedOwnWindow(hwnd)
}

function passKey(altIsDown) {
  return { action: null, altIsDown, swallow: false }
}

function tabKeyAction(state) {
  if (!state.altIsDown) return passKey(false)
  if (!state.isAltHeld()) return state.active ? { action: 'commit', altIsDown: false, swallow: true } : passKey(false)
  const backward = state.isShiftHeld()
  if (state.active) return { action: backward ? 'cycleBackward' : 'cycleForward', altIsDown: true, swallow: true }
  if (state.building) return { action: backward ? 'queueBackward' : 'queueForward', altIsDown: true, swallow: true }
  return { action: 'open', altIsDown: true, swallow: true }
}

function altKeyAction(keyEvent, state) {
  if (keyEvent.isKeyDown) return passKey(true)
  if (keyEvent.isKeyUp) return { action: state.active ? 'commit' : null, altIsDown: false, swallow: false }
  return passKey(state.altIsDown)
}

function escapeKeyAction(state) {
  if (!state.active && !state.building) return passKey(state.altIsDown)
  return { action: 'hide', altIsDown: false, swallow: true }
}

function switcherKeyAction(keyEvent, state) {
  if (keyEvent.vkCode === VK_TAB && keyEvent.isKeyDown) return tabKeyAction(state)
  if (isAltKey(keyEvent.vkCode)) return altKeyAction(keyEvent, state)
  if (keyEvent.vkCode === VK_ESCAPE && keyEvent.isKeyDown) return escapeKeyAction(state)
  return passKey(state.altIsDown)
}

module.exports = {
  THUMBNAIL_STALE_MS,
  initialSelection,
  planSwitcherAfterBuild,
  isThumbnailStale,
  isSwitcherWindow,
  switcherKeyAction,
}

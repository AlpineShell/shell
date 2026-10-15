const { VK_TAB, VK_ESCAPE, VK_RETURN, VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN, isAltKey } = require('./virtualKeys')

const THUMBNAIL_STALE_MS = 30000
const WS_EX_TOOLWINDOW = 0x00000080
const ROW_TOLERANCE_PX = 8

const ARROW_DIRECTIONS = new Map([
  [VK_LEFT, 'left'],
  [VK_RIGHT, 'right'],
  [VK_UP, 'up'],
  [VK_DOWN, 'down'],
])

const QUEUED_STEP_ACTIONS = { left: 'queueBackward', right: 'queueForward' }

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

function arrowKeyAction(direction, state) {
  if (state.active) return { action: 'move', direction, altIsDown: state.altIsDown, swallow: true }
  if (state.building) return { action: QUEUED_STEP_ACTIONS[direction] ?? null, altIsDown: state.altIsDown, swallow: true }
  return passKey(state.altIsDown)
}

function enterKeyAction(state) {
  if (!state.active) return passKey(state.altIsDown)
  return { action: 'commit', altIsDown: state.altIsDown, swallow: true }
}

function groupIntoRows(cardCenters) {
  const rows = []
  cardCenters.forEach((center, index) => {
    const row = rows.find((candidate) => Math.abs(candidate.y - center.y) <= ROW_TOLERANCE_PX)
    if (row) row.indices.push(index)
    else rows.push({ y: center.y, indices: [index] })
  })
  return rows.sort((a, b) => a.y - b.y)
}

function nearestInRow(indices, x, cardCenters) {
  return indices.reduce((best, index) => (Math.abs(cardCenters[index].x - x) < Math.abs(cardCenters[best].x - x) ? index : best))
}

function selectionAfterMove(index, direction, windowCount, cardCenters) {
  if (windowCount <= 0) return 0
  if (direction === 'left') return (index - 1 + windowCount) % windowCount
  if (direction === 'right') return (index + 1) % windowCount
  if (!Array.isArray(cardCenters) || cardCenters.length !== windowCount) return index
  const rows = groupIntoRows(cardCenters)
  const rowIndex = rows.findIndex((row) => row.indices.includes(index))
  const target = rows[rowIndex + (direction === 'down' ? 1 : -1)]
  return target ? nearestInRow(target.indices, cardCenters[index].x, cardCenters) : index
}

function switcherKeyAction(keyEvent, state) {
  if (keyEvent.vkCode === VK_TAB && keyEvent.isKeyDown) return tabKeyAction(state)
  if (isAltKey(keyEvent.vkCode)) return altKeyAction(keyEvent, state)
  if (keyEvent.vkCode === VK_ESCAPE && keyEvent.isKeyDown) return escapeKeyAction(state)
  if (keyEvent.vkCode === VK_RETURN && keyEvent.isKeyDown) return enterKeyAction(state)
  const direction = ARROW_DIRECTIONS.get(keyEvent.vkCode)
  if (direction && keyEvent.isKeyDown) return arrowKeyAction(direction, state)
  return passKey(state.altIsDown)
}

module.exports = {
  THUMBNAIL_STALE_MS,
  initialSelection,
  planSwitcherAfterBuild,
  isThumbnailStale,
  isSwitcherWindow,
  switcherKeyAction,
  selectionAfterMove,
}

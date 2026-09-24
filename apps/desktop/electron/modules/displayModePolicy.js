const DISPLAY_MODES = ['internal', 'clone', 'extend', 'external']

const TOPOLOGY_ID_BY_MODE = { internal: 0x1, clone: 0x2, extend: 0x4, external: 0x8 }

const PATH_INFO_SIZE = 72
const TARGET_ADAPTER_LOW_OFFSET = 20
const TARGET_ADAPTER_HIGH_OFFSET = 24
const TARGET_ID_OFFSET = 28
const TARGET_AVAILABLE_OFFSET = 60

const VK_RETURN = 0x0D
const VK_SHIFT = 0x10
const VK_CONTROL = 0x11
const VK_MENU = 0x12
const VK_ESCAPE = 0x1B
const VK_SPACE = 0x20
const VK_LEFT = 0x25
const VK_UP = 0x26
const VK_RIGHT = 0x27
const VK_DOWN = 0x28
const VK_P = 0x50
const VK_LWIN = 0x5B
const VK_RWIN = 0x5C
const VK_LSHIFT = 0xA0
const VK_RMENU = 0xA5

const MODIFIER_KEYS = new Set([VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN])

function isModifierKey(vkCode) {
  return MODIFIER_KEYS.has(vkCode) || (vkCode >= VK_LSHIFT && vkCode <= VK_RMENU)
}

function modeForTopologyId(topologyId) {
  return DISPLAY_MODES.find(mode => TOPOLOGY_ID_BY_MODE[mode] === topologyId) ?? null
}

function topologyFlagForMode(mode) {
  return TOPOLOGY_ID_BY_MODE[mode] ?? null
}

function countConnectedTargets(pathBuffer, pathCount) {
  const connected = new Set()
  const readable = Math.min(pathCount, Math.floor(pathBuffer.length / PATH_INFO_SIZE))
  for (let index = 0; index < readable; index++) {
    const base = index * PATH_INFO_SIZE
    if (pathBuffer.readUInt32LE(base + TARGET_AVAILABLE_OFFSET) === 0) continue
    const adapterLow = pathBuffer.readUInt32LE(base + TARGET_ADAPTER_LOW_OFFSET)
    const adapterHigh = pathBuffer.readInt32LE(base + TARGET_ADAPTER_HIGH_OFFSET)
    const targetId = pathBuffer.readUInt32LE(base + TARGET_ID_OFFSET)
    connected.add(`${adapterHigh}:${adapterLow}:${targetId}`)
  }
  return connected.size
}

function planDisplayModeOptions({ connectedTargets, currentMode }) {
  const everyModeFits = connectedTargets >= 2
  return DISPLAY_MODES.map(mode => ({ mode, available: everyModeFits || mode === currentMode }))
}

function initialDisplayMode(options, currentMode) {
  if (currentMode && options.some(option => option.mode === currentMode)) return currentMode
  const firstAvailable = options.find(option => option.available)
  return firstAvailable ? firstAvailable.mode : DISPLAY_MODES[0]
}

function stepDisplayMode(options, selectedMode, direction) {
  const start = options.findIndex(option => option.mode === selectedMode)
  if (start === -1) return selectedMode
  for (let step = 1; step <= options.length; step++) {
    const candidate = options[((start + direction * step) % options.length + options.length) % options.length]
    if (candidate.available) return candidate.mode
  }
  return selectedMode
}

function shouldApplyDisplayMode(options, currentMode, chosenMode) {
  const option = options.find(entry => entry.mode === chosenMode)
  return Boolean(option && option.available && chosenMode !== currentMode)
}

function displayModeKeyAction(vkCode, shiftHeld) {
  if (vkCode === VK_P) return { action: shiftHeld ? 'previous' : 'next', swallow: true }
  if (vkCode === VK_RIGHT || vkCode === VK_DOWN) return { action: 'next', swallow: true }
  if (vkCode === VK_LEFT || vkCode === VK_UP) return { action: 'previous', swallow: true }
  if (vkCode === VK_RETURN || vkCode === VK_SPACE) return { action: 'apply', swallow: true }
  if (vkCode === VK_ESCAPE) return { action: 'dismiss', swallow: true }
  if (isModifierKey(vkCode)) return { action: 'ignore', swallow: false }
  return { action: 'dismiss', swallow: false }
}

module.exports = {
  DISPLAY_MODES,
  PATH_INFO_SIZE,
  modeForTopologyId,
  topologyFlagForMode,
  countConnectedTargets,
  planDisplayModeOptions,
  initialDisplayMode,
  stepDisplayMode,
  shouldApplyDisplayMode,
  displayModeKeyAction,
}

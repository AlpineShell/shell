const APPROVED_BASE = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'
const APPROVED_ENABLED = '020000000000000000000000'
const APPROVED_DISABLED = '030000000000000000000000'

function isApprovedDisabledByte(firstByte) {
  return (firstByte & 0x01) === 0x01
}

function parseApprovedMap(regQueryOutput) {
  const map = new Map()
  for (const line of (regQueryOutput || '').split('\n')) {
    const match = line.match(/^\s+(.+?)\s+REG_BINARY\s+([0-9A-Fa-f]+)/)
    if (!match) continue
    const hex = match[2]
    if (hex.length < 2) continue
    const firstByte = parseInt(hex.slice(0, 2), 16)
    map.set(match[1].trim().toLowerCase(), isApprovedDisabledByte(firstByte))
  }
  return map
}

function isMsixStateEnabled(state) {
  return state === 2 || state === 4
}

module.exports = {
  APPROVED_BASE,
  APPROVED_ENABLED,
  APPROVED_DISABLED,
  isApprovedDisabledByte,
  parseApprovedMap,
  isMsixStateEnabled,
}

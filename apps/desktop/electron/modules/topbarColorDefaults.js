const DEFAULT_TOPBAR_COLOR = Object.freeze({ r: 32, g: 32, b: 32, darkText: false })

function isTopbarColor(color) {
  return !!color && typeof color.r === 'number' && typeof color.g === 'number' && typeof color.b === 'number'
}

function storedOverride(data) {
  if (!data || typeof data !== 'object' || !('color' in data)) return DEFAULT_TOPBAR_COLOR
  return isTopbarColor(data.color) ? data.color : null
}

module.exports = {
  DEFAULT_TOPBAR_COLOR,
  storedOverride,
}

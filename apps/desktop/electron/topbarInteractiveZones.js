const INTERACTIVE_RIGHT = 600
const INTERACTIVE_LEFT = 300
const INTERACTIVE_CENTER = 120
const MAX_INTERACTIVE_ZONES = 3

function fixedInteractiveZones(width) {
  const center = width / 2
  return [
    { left: 0, right: INTERACTIVE_LEFT },
    { left: center - INTERACTIVE_CENTER / 2, right: center + INTERACTIVE_CENTER / 2 },
    { left: width - INTERACTIVE_RIGHT, right: width },
  ]
}

function isFiniteZone(zone) {
  return zone !== null && typeof zone === 'object' && Number.isFinite(zone.left) && Number.isFinite(zone.right)
}

function clampToBar(value, width) {
  return Math.min(Math.max(value, 0), width)
}

function clampZoneToBar(zone, width) {
  return { left: clampToBar(zone.left, width), right: clampToBar(zone.right, width) }
}

function hasWidth(zone) {
  return zone.right > zone.left
}

function sanitizeInteractiveZones(zones, width) {
  if (!Array.isArray(zones)) return null
  return zones
    .slice(0, MAX_INTERACTIVE_ZONES)
    .filter(isFiniteZone)
    .map((zone) => clampZoneToBar(zone, width))
    .filter(hasWidth)
}

function isCursorInInteractiveZone(localX, zones, width) {
  const spans = Array.isArray(zones) ? zones : fixedInteractiveZones(width)
  return spans.some((zone) => localX >= zone.left && localX < zone.right)
}

module.exports = {
  INTERACTIVE_LEFT,
  INTERACTIVE_CENTER,
  INTERACTIVE_RIGHT,
  MAX_INTERACTIVE_ZONES,
  sanitizeInteractiveZones,
  isCursorInInteractiveZone,
}

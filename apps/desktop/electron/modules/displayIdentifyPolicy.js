const BADGE_SIZE_DIP = 132
const BADGE_MARGIN_DIP = 40
const IDENTIFY_DURATION_MS = 3000

function badgeBoundsWithin(displayBounds) {
  const size = Math.max(1, Math.min(BADGE_SIZE_DIP, displayBounds.width, displayBounds.height))
  const margin = Math.max(0, Math.min(BADGE_MARGIN_DIP, Math.floor((Math.min(displayBounds.width, displayBounds.height) - size) / 2)))
  return {
    x: Math.round(displayBounds.x + margin),
    y: Math.round(displayBounds.y + displayBounds.height - margin - size),
    width: size,
    height: size,
  }
}

function planIdentifyBadges(displays, toDipRect) {
  if (!Array.isArray(displays)) return []
  return displays.flatMap((display, index) => {
    if (!(display.width > 0 && display.height > 0)) return []
    const dipBounds = toDipRect({ x: display.x, y: display.y, width: display.width, height: display.height })
    if (!dipBounds) return []
    return [{ displayId: display.id, number: index + 1, bounds: badgeBoundsWithin(dipBounds) }]
  })
}

module.exports = { planIdentifyBadges, badgeBoundsWithin, IDENTIFY_DURATION_MS }

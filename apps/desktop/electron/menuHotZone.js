const MENU_HOT_MARGIN = 64

function rectOnScreen(bounds, rect) {
  return {
    left: bounds.x + rect.left,
    right: bounds.x + rect.right,
    top: bounds.y + rect.top,
    bottom: bounds.y + rect.bottom,
  }
}

function windowRect(bounds) {
  return {
    left: bounds.x,
    right: bounds.x + bounds.width,
    top: bounds.y,
    bottom: bounds.y + bounds.height,
  }
}

function padRect(rect, margin) {
  return {
    left: rect.left - margin,
    right: rect.right + margin,
    top: rect.top - margin,
    bottom: rect.bottom + margin,
  }
}

function intersectRects(a, b) {
  return {
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.max(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
  }
}

function rectContains(rect, point) {
  return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom
}

function isPointInMenuHotZone(point, bounds, region) {
  if (!region) return false
  return rectContains(padRect(rectOnScreen(bounds, region), MENU_HOT_MARGIN), point)
}

function shouldClickCloseMenu(point, bounds, region) {
  if (!region || !region.contentBounds) return false
  const content = rectOnScreen(bounds, region.contentBounds)
  if (point.y < content.top) return false
  if (rectContains(content, point)) return false
  const band = padRect(rectOnScreen(bounds, region), MENU_HOT_MARGIN)
  return rectContains(intersectRects(band, windowRect(bounds)), point)
}

module.exports = {
  MENU_HOT_MARGIN,
  isPointInMenuHotZone,
  shouldClickCloseMenu,
}

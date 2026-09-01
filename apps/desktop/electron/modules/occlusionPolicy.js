const VISIBLE_AREA_TOLERANCE_PX = 2500

const VISIBILITY_VISIBLE = 'visible'
const VISIBILITY_OCCLUDED = 'occluded'
const VISIBILITY_OFFSCREEN = 'offscreen'
const VISIBILITY_HIDDEN = 'hidden'

function isRect(rect) {
  if (!rect) return false
  return ['left', 'top', 'right', 'bottom'].every((edge) => Number.isFinite(rect[edge]))
}

function isEmptyRect(rect) {
  if (!isRect(rect)) return true
  return rect.right <= rect.left || rect.bottom <= rect.top
}

function area(rect) {
  if (isEmptyRect(rect)) return 0
  return (rect.right - rect.left) * (rect.bottom - rect.top)
}

function totalArea(rects) {
  return (rects ?? []).reduce((sum, rect) => sum + area(rect), 0)
}

function intersect(a, b) {
  if (isEmptyRect(a) || isEmptyRect(b)) return null
  const clipped = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  }
  return isEmptyRect(clipped) ? null : clipped
}

function subtractRect(target, cutter) {
  if (isEmptyRect(target)) return []
  const overlap = intersect(target, cutter)
  if (!overlap) return [target]
  const pieces = []
  if (overlap.top > target.top) {
    pieces.push({ left: target.left, top: target.top, right: target.right, bottom: overlap.top })
  }
  if (overlap.bottom < target.bottom) {
    pieces.push({ left: target.left, top: overlap.bottom, right: target.right, bottom: target.bottom })
  }
  if (overlap.left > target.left) {
    pieces.push({ left: target.left, top: overlap.top, right: overlap.left, bottom: overlap.bottom })
  }
  if (overlap.right < target.right) {
    pieces.push({ left: overlap.right, top: overlap.top, right: target.right, bottom: overlap.bottom })
  }
  return pieces.filter((piece) => !isEmptyRect(piece))
}

function subtractRects(targets, cutter) {
  const remaining = []
  for (const target of targets ?? []) remaining.push(...subtractRect(target, cutter))
  return remaining
}

function clipToMonitors(bounds, monitors) {
  const pieces = []
  for (const monitor of monitors ?? []) {
    const clipped = intersect(bounds, monitor)
    if (clipped) pieces.push(clipped)
  }
  return pieces
}

function remainderAfterCutters(pieces, cutters) {
  let remaining = pieces ?? []
  for (const cutter of cutters ?? []) {
    if (remaining.length === 0) break
    remaining = subtractRects(remaining, cutter)
  }
  return remaining
}

function paintsOverOtherWindows(window) {
  if (!window) return false
  if (window.minimized || window.cloaked) return false
  if (window.transparent || window.toolWindow) return false
  if (isEmptyRect(window.bounds)) return false
  return true
}

function resolveTolerance(tolerancePx) {
  return Number.isFinite(tolerancePx) ? tolerancePx : VISIBLE_AREA_TOLERANCE_PX
}

function classifyWindowVisibility(window, cutters, monitors, tolerancePx) {
  if (!window) return VISIBILITY_HIDDEN
  if (window.minimized || window.cloaked) return VISIBILITY_HIDDEN
  if (isEmptyRect(window.bounds)) return VISIBILITY_HIDDEN
  if (!monitors || monitors.length === 0) return VISIBILITY_VISIBLE
  const onScreen = clipToMonitors(window.bounds, monitors)
  if (onScreen.length === 0) return VISIBILITY_OFFSCREEN
  const remainder = remainderAfterCutters(onScreen, cutters)
  return totalArea(remainder) > resolveTolerance(tolerancePx) ? VISIBILITY_VISIBLE : VISIBILITY_OCCLUDED
}

function computeWindowVisibility(zOrderedWindows, monitors, tolerancePx) {
  const tolerance = resolveTolerance(tolerancePx)
  const cutters = []
  const results = []
  for (const window of zOrderedWindows ?? []) {
    const visibility = classifyWindowVisibility(window, cutters, monitors, tolerance)
    results.push({ ...window, visibility })
    if (paintsOverOtherWindows(window)) cutters.push(window.bounds)
  }
  return results
}

function coversMonitor(bounds, monitors) {
  if (isEmptyRect(bounds)) return false
  for (const monitor of monitors ?? []) {
    if (isEmptyRect(monitor)) continue
    if (bounds.left <= monitor.left && bounds.top <= monitor.top
      && bounds.right >= monitor.right && bounds.bottom >= monitor.bottom) return true
  }
  return false
}

module.exports = {
  VISIBLE_AREA_TOLERANCE_PX,
  VISIBILITY_VISIBLE,
  VISIBILITY_OCCLUDED,
  VISIBILITY_OFFSCREEN,
  VISIBILITY_HIDDEN,
  isEmptyRect,
  area,
  totalArea,
  intersect,
  subtractRect,
  subtractRects,
  clipToMonitors,
  remainderAfterCutters,
  paintsOverOtherWindows,
  resolveTolerance,
  classifyWindowVisibility,
  computeWindowVisibility,
  coversMonitor,
}

function clipToDisplay(frame, pixelBounds) {
  return {
    left: Math.max(frame.left, pixelBounds.x),
    top: Math.max(frame.top, pixelBounds.y),
    right: Math.min(frame.right, pixelBounds.x + pixelBounds.width),
    bottom: Math.min(frame.bottom, pixelBounds.y + pixelBounds.height),
  }
}

function hasArea(rect) {
  return rect.right > rect.left && rect.bottom > rect.top
}

function toDisplayPoints(rect, pixelBounds, scaleFactor) {
  return {
    left: Math.floor((rect.left - pixelBounds.x) / scaleFactor),
    top: Math.floor((rect.top - pixelBounds.y) / scaleFactor),
    right: Math.ceil((rect.right - pixelBounds.x) / scaleFactor),
    bottom: Math.ceil((rect.bottom - pixelBounds.y) / scaleFactor),
  }
}

function contains(outer, inner) {
  return outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom
}

function compareRects(a, b) {
  return a.top - b.top || a.left - b.left || a.bottom - b.bottom || a.right - b.right
}

function addsCoverage(rect, index, rects) {
  return !rects.some((other, otherIndex) => {
    if (otherIndex === index || !contains(other, rect)) return false
    return !contains(rect, other) || otherIndex < index
  })
}

function displayCoverage(frames, pixelBounds, scaleFactor) {
  return frames
    .map((frame) => clipToDisplay(frame, pixelBounds))
    .filter(hasArea)
    .map((rect) => toDisplayPoints(rect, pixelBounds, scaleFactor))
    .filter(addsCoverage)
    .sort(compareRects)
}

function sameCoverage(a, b) {
  if (!a || !b || a.length !== b.length) return false
  return a.every((rect, index) => compareRects(rect, b[index]) === 0)
}

function coversWholeMonitor(frame, monitorBounds) {
  return Boolean(frame && monitorBounds) && contains(frame, monitorBounds)
}

module.exports = { displayCoverage, sameCoverage, coversWholeMonitor }

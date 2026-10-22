function rectInsideShellWindow(monitorRect, virtualScreen) {
  return {
    x: monitorRect.left - virtualScreen.x,
    y: monitorRect.top - virtualScreen.y,
    width: monitorRect.right - monitorRect.left,
    height: monitorRect.bottom - monitorRect.top,
  }
}

function displayCenter({ x, y, width, height }) {
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) }
}

module.exports = { rectInsideShellWindow, displayCenter }

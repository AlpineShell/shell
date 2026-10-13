function canMinimize(window) {
  return !window.minimized && window.enabled && window.hasMinimizeBox
}

function planMinimizeAll(windowsTopFirst) {
  const minimizable = windowsTopFirst.filter(canMinimize).map((window) => window.hwnd)
  return { remember: minimizable, minimizeOrder: minimizable.slice().reverse() }
}

function rememberMinimized(previousTopFirst, minimizedNowTopFirst, isStillMinimized) {
  const fresh = new Set(minimizedNowTopFirst)
  const carriedOver = previousTopFirst.filter((hwnd) => !fresh.has(hwnd) && isStillMinimized(hwnd))
  return [...minimizedNowTopFirst, ...carriedOver]
}

function planRestore(rememberedTopFirst, isStillMinimized) {
  const restorable = rememberedTopFirst.filter(isStillMinimized)
  if (restorable.length === 0) return { restoreOrder: [], activate: null }
  const [topmost, ...below] = restorable
  return { restoreOrder: below.reverse(), activate: topmost }
}

module.exports = { canMinimize, planMinimizeAll, rememberMinimized, planRestore }

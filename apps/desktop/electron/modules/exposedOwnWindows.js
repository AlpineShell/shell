function resolveExposedOwnWindows(provider) {
  if (typeof provider !== 'function') return []
  try {
    const handles = provider()
    return Array.isArray(handles) ? handles : []
  } catch {
    return []
  }
}

function isExposedOwnWindow(hwnd, provider) {
  if (!hwnd) return false
  return resolveExposedOwnWindows(provider).includes(hwnd)
}

module.exports = { resolveExposedOwnWindows, isExposedOwnWindow }

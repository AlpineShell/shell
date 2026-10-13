let shells = null

function setShells(shellsByDisplay) {
  shells = shellsByDisplay
}

function nativeHandleOf(win) {
  return win.getNativeWindowHandle().readUInt32LE(0)
}

function isLiveSurfaceWithHandle(win, hwnd) {
  return Boolean(win) && !win.isDestroyed() && nativeHandleOf(win) === hwnd
}

function isShellSurface(hwnd) {
  if (!shells || !hwnd) return false
  for (const shell of shells.values()) {
    if (isLiveSurfaceWithHandle(shell.topBar, hwnd) || isLiveSurfaceWithHandle(shell.desktop, hwnd)) return true
  }
  return false
}

function topBarForDisplay(displayId) {
  const shell = shells && shells.get(displayId)
  if (!shell || !shell.topBar || shell.topBar.isDestroyed()) return null
  return shell.topBar
}

module.exports = { setShells, isShellSurface, topBarForDisplay }

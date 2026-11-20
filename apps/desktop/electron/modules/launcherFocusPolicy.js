function focusTargetOnHide({ restoreFocus, tookFocus, previousForeground }) {
  if (!restoreFocus || !tookFocus || !previousForeground) return 0
  return previousForeground
}

function captureFocusTarget({ wasActive, currentTarget, foreground, isShellSurface }) {
  if (wasActive) return currentTarget
  if (!foreground || isShellSurface(foreground)) return 0
  return foreground
}

module.exports = { focusTargetOnHide, captureFocusTarget }

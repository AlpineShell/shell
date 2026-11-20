const { captureFocusTarget, focusTargetOnHide } = require('./modules/launcherFocusPolicy')

function shouldAutoCloseMenu({ activeRegion, menuFocusable }) {
  return Boolean(activeRegion) && !menuFocusable
}

function planMenuFocusChange({ currentFocusable, currentReturnTarget, requested, hasActiveRegion, foreground, isShellSurface }) {
  if (requested) {
    if (!hasActiveRegion) {
      return { focusable: false, returnTarget: 0, takeFocus: false, releaseFocus: currentFocusable, restoreTarget: 0 }
    }
    const returnTarget = captureFocusTarget({
      wasActive: currentFocusable,
      currentTarget: currentReturnTarget,
      foreground,
      isShellSurface,
    })
    return { focusable: true, returnTarget, takeFocus: true, releaseFocus: false, restoreTarget: 0 }
  }
  if (!currentFocusable) {
    return { focusable: false, returnTarget: 0, takeFocus: false, releaseFocus: false, restoreTarget: 0 }
  }
  const restoreTarget = focusTargetOnHide({
    restoreFocus: true,
    tookFocus: true,
    previousForeground: currentReturnTarget,
  })
  return { focusable: false, returnTarget: 0, takeFocus: false, releaseFocus: true, restoreTarget }
}

function planMenuBlur({ menuFocusable }) {
  if (!menuFocusable) return { closeMenu: false, releaseFocus: false }
  return { closeMenu: true, releaseFocus: true }
}

module.exports = {
  planMenuBlur,
  planMenuFocusChange,
  shouldAutoCloseMenu,
}

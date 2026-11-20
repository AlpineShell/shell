import { describe, it, expect } from 'vitest'
import launcherFocusPolicy from './launcherFocusPolicy.js'

const { focusTargetOnHide, captureFocusTarget } = launcherFocusPolicy

describe('captureFocusTarget', () => {
  const isShellSurface = (hwnd) => hwnd === 99

  it('captures a non-shell foreground window when opening fresh', () => {
    expect(captureFocusTarget({ wasActive: false, currentTarget: 0, foreground: 42, isShellSurface })).toBe(42)
  })

  it('clears the target when opening from a shell surface or with no foreground window', () => {
    expect(captureFocusTarget({ wasActive: false, currentTarget: 42, foreground: 99, isShellSurface })).toBe(0)
    expect(captureFocusTarget({ wasActive: false, currentTarget: 42, foreground: 0, isShellSurface })).toBe(0)
  })

  it('keeps the existing target when reopening while already active', () => {
    expect(captureFocusTarget({ wasActive: true, currentTarget: 42, foreground: 99, isShellSurface })).toBe(42)
  })
})

describe('focusTargetOnHide', () => {
  it('returns the previous foreground window when cancelling a focused launcher', () => {
    expect(focusTargetOnHide({ restoreFocus: true, tookFocus: true, previousForeground: 42 })).toBe(42)
  })

  it('returns 0 when restoreFocus is not requested', () => {
    expect(focusTargetOnHide({ restoreFocus: false, tookFocus: true, previousForeground: 42 })).toBe(0)
  })

  it('returns 0 when the launcher never took focus', () => {
    expect(focusTargetOnHide({ restoreFocus: true, tookFocus: false, previousForeground: 42 })).toBe(0)
  })

  it('returns 0 when there is no previous foreground window', () => {
    expect(focusTargetOnHide({ restoreFocus: true, tookFocus: true, previousForeground: 0 })).toBe(0)
  })
})

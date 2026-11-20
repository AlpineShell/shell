import { describe, expect, it } from 'vitest'
import menuFocusPolicy from './menuFocusPolicy.js'

const { planMenuBlur, planMenuFocusChange, shouldAutoCloseMenu } = menuFocusPolicy

describe('shouldAutoCloseMenu', () => {
  const region = { top: 24, bottom: 300, left: 800, right: 1100 }

  it('auto-closes a passive menu when the cursor leaves', () => {
    expect(shouldAutoCloseMenu({ activeRegion: region, menuFocusable: false })).toBe(true)
  })

  it('pauses hover-away auto-close while a menu holds keyboard focus', () => {
    expect(shouldAutoCloseMenu({ activeRegion: region, menuFocusable: true })).toBe(false)
  })

  it('does not auto-close when no menu is open', () => {
    expect(shouldAutoCloseMenu({ activeRegion: null, menuFocusable: false })).toBe(false)
  })
})

describe('planMenuFocusChange', () => {
  const isShellSurface = (hwnd) => hwnd === 99

  it('captures the previous app window and takes focus when a menu requests it', () => {
    expect(planMenuFocusChange({
      currentFocusable: false,
      currentReturnTarget: 0,
      requested: true,
      hasActiveRegion: true,
      foreground: 42,
      isShellSurface,
    })).toEqual({
      focusable: true,
      returnTarget: 42,
      takeFocus: true,
      releaseFocus: false,
      restoreTarget: 0,
    })
  })

  it('keeps the original return target when focus is requested again while already focused', () => {
    expect(planMenuFocusChange({
      currentFocusable: true,
      currentReturnTarget: 42,
      requested: true,
      hasActiveRegion: true,
      foreground: 99,
      isShellSurface,
    })).toEqual({
      focusable: true,
      returnTarget: 42,
      takeFocus: true,
      releaseFocus: false,
      restoreTarget: 0,
    })
  })

  it('ignores a focus request when no menu region is active', () => {
    expect(planMenuFocusChange({
      currentFocusable: false,
      currentReturnTarget: 0,
      requested: true,
      hasActiveRegion: false,
      foreground: 42,
      isShellSurface,
    })).toEqual({
      focusable: false,
      returnTarget: 0,
      takeFocus: false,
      releaseFocus: false,
      restoreTarget: 0,
    })
  })

  it('releases focus and restores the previous app window when focus is turned off', () => {
    expect(planMenuFocusChange({
      currentFocusable: true,
      currentReturnTarget: 42,
      requested: false,
      hasActiveRegion: true,
      foreground: 99,
      isShellSurface,
    })).toEqual({
      focusable: false,
      returnTarget: 0,
      takeFocus: false,
      releaseFocus: true,
      restoreTarget: 42,
    })
  })

  it('does nothing when releasing focus that was not held', () => {
    expect(planMenuFocusChange({
      currentFocusable: false,
      currentReturnTarget: 0,
      requested: false,
      hasActiveRegion: true,
      foreground: 42,
      isShellSurface,
    })).toEqual({
      focusable: false,
      returnTarget: 0,
      takeFocus: false,
      releaseFocus: false,
      restoreTarget: 0,
    })
  })
})

describe('planMenuBlur', () => {
  it('closes the menu and releases focus when a focused menu loses window focus', () => {
    expect(planMenuBlur({ menuFocusable: true })).toEqual({ closeMenu: true, releaseFocus: true })
  })

  it('ignores blur when the menu did not hold focus', () => {
    expect(planMenuBlur({ menuFocusable: false })).toEqual({ closeMenu: false, releaseFocus: false })
  })
})

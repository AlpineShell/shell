import { describe, it, expect } from 'vitest'
import fixedSurfaceKeyPolicy from './fixedSurfaceKeyPolicy.js'
import virtualKeys from './virtualKeys.js'

const { isWindowArrangementKey, isFixedShellSurface, holdsWindowArrangementKey } = fixedSurfaceKeyPolicy
const { VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN, VK_F4, VK_E, VK_TAB } = virtualKeys

function modifiers({ win = false, ctrl = false, alt = false, shift = false } = {}) {
  return { isWinHeld: () => win, isCtrlHeld: () => ctrl, isAltHeld: () => alt, isShiftHeld: () => shift }
}

const WIN = modifiers({ win: true })
const WIN_SHIFT = modifiers({ win: true, shift: true })
const WIN_CTRL = modifiers({ win: true, ctrl: true })
const WIN_CTRL_SHIFT = modifiers({ win: true, ctrl: true, shift: true })
const ALT = modifiers({ alt: true })
const NONE = modifiers()

const RIDGE = { exists: true, ownProcess: true, arrangeable: false }
const SETTINGS = { exists: true, ownProcess: true, arrangeable: true }
const OTHER_APP = { exists: true, ownProcess: false, arrangeable: false }
const NO_WINDOW = { exists: false, ownProcess: false, arrangeable: false }

describe('isWindowArrangementKey', () => {
  it('covers the Win+arrow snap, maximize and minimize keys', () => {
    for (const vkCode of [VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN]) {
      expect(isWindowArrangementKey(vkCode, WIN)).toBe(true)
    }
  })

  it('covers Win+Shift+arrow, which moves a window to another display or stretches it', () => {
    for (const vkCode of [VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN]) {
      expect(isWindowArrangementKey(vkCode, WIN_SHIFT)).toBe(true)
    }
  })

  it('covers Alt+F4', () => {
    expect(isWindowArrangementKey(VK_F4, ALT)).toBe(true)
  })

  it('leaves the desktop switching keys on Win+Ctrl+arrow alone', () => {
    expect(isWindowArrangementKey(VK_LEFT, WIN_CTRL)).toBe(false)
    expect(isWindowArrangementKey(VK_RIGHT, WIN_CTRL_SHIFT)).toBe(false)
    expect(isWindowArrangementKey(VK_F4, WIN_CTRL)).toBe(false)
  })

  it('leaves plain arrows, other Win keys and unrelated keys alone', () => {
    expect(isWindowArrangementKey(VK_LEFT, NONE)).toBe(false)
    expect(isWindowArrangementKey(VK_DOWN, ALT)).toBe(false)
    expect(isWindowArrangementKey(VK_F4, NONE)).toBe(false)
    expect(isWindowArrangementKey(VK_E, WIN)).toBe(false)
    expect(isWindowArrangementKey(VK_TAB, ALT)).toBe(false)
  })
})

describe('isFixedShellSurface', () => {
  it('treats a shell window nobody arranges, such as the Ridge, as fixed', () => {
    expect(isFixedShellSurface(RIDGE)).toBe(true)
  })

  it('lets settings, plugin windows and setup be arranged like any app', () => {
    expect(isFixedShellSurface(SETTINGS)).toBe(false)
  })

  it('never claims another app or a missing window', () => {
    expect(isFixedShellSurface(OTHER_APP)).toBe(false)
    expect(isFixedShellSurface(NO_WINDOW)).toBe(false)
    expect(isFixedShellSurface(null)).toBe(false)
  })
})

describe('holdsWindowArrangementKey', () => {
  it('holds Win+Shift+Left back from Windows while the launcher on the Ridge has focus', () => {
    expect(holdsWindowArrangementKey(VK_LEFT, WIN_SHIFT, () => RIDGE)).toBe(true)
  })

  it('holds Win+Down and Alt+F4 back while the Ridge has focus', () => {
    expect(holdsWindowArrangementKey(VK_DOWN, WIN, () => RIDGE)).toBe(true)
    expect(holdsWindowArrangementKey(VK_F4, ALT, () => RIDGE)).toBe(true)
  })

  it('passes the keys on for other apps and arrangeable shell windows', () => {
    expect(holdsWindowArrangementKey(VK_LEFT, WIN_SHIFT, () => OTHER_APP)).toBe(false)
    expect(holdsWindowArrangementKey(VK_LEFT, WIN_SHIFT, () => SETTINGS)).toBe(false)
  })

  it('never looks up the foreground window for a key it does not hold', () => {
    let lookups = 0
    const describeForeground = () => { lookups += 1; return RIDGE }
    expect(holdsWindowArrangementKey(VK_E, WIN, describeForeground)).toBe(false)
    expect(lookups).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import windowSwitcherPolicy from './windowSwitcherPolicy.js'
import virtualKeys from './virtualKeys.js'

const {
  THUMBNAIL_STALE_MS,
  initialSelection,
  planSwitcherAfterBuild,
  isThumbnailStale,
  isSwitcherWindow,
  switcherKeyAction,
} = windowSwitcherPolicy
const { VK_TAB, VK_ESCAPE, VK_LMENU, VK_RMENU, VK_E } = virtualKeys

const WS_EX_TOOLWINDOW = 0x80
const HWND = 0x1234

function built(overrides) {
  return { isLatestBuild: true, windowCount: 4, altHeld: true, pendingSteps: 0, ...overrides }
}

function windowProbe(overrides) {
  return {
    isVisible: () => true,
    exStyle: () => 0,
    isCloaked: () => false,
    titleLength: () => 12,
    isShellSurface: () => false,
    isShellWindow: () => false,
    isOwnProcess: () => false,
    isExposedOwnWindow: () => false,
    ...overrides,
  }
}

function keyDown(vkCode) {
  return { vkCode, isKeyDown: true, isKeyUp: false }
}

function keyUp(vkCode) {
  return { vkCode, isKeyDown: false, isKeyUp: true }
}

function switcherState(overrides) {
  return {
    altIsDown: true,
    active: false,
    building: false,
    isAltHeld: () => true,
    isShiftHeld: () => false,
    ...overrides,
  }
}

describe('initialSelection', () => {
  it('starts on the previous window, like Windows', () => {
    expect(initialSelection(4, 0)).toBe(1)
  })

  it('stays on the only window when there is one', () => {
    expect(initialSelection(1, 0)).toBe(0)
    expect(initialSelection(1, 3)).toBe(0)
  })

  it('applies Tab presses that arrived while the list was being built', () => {
    expect(initialSelection(4, 2)).toBe(3)
    expect(initialSelection(4, 3)).toBe(0)
  })

  it('wraps backwards for Shift+Tab presses', () => {
    expect(initialSelection(4, -1)).toBe(0)
    expect(initialSelection(4, -2)).toBe(3)
    expect(initialSelection(3, -7)).toBe(0)
  })

  it('has nothing to select in an empty list', () => {
    expect(initialSelection(0, 2)).toBe(0)
  })
})

describe('planSwitcherAfterBuild', () => {
  it('shows the switcher while Alt is still held', () => {
    expect(planSwitcherAfterBuild(built())).toEqual({ action: 'show', index: 1 })
  })

  it('switches straight to the previous window when Alt was released during the build', () => {
    expect(planSwitcherAfterBuild(built({ altHeld: false }))).toEqual({ action: 'switch', index: 1 })
  })

  it('switches to the window the extra Tab presses reached when Alt was released', () => {
    expect(planSwitcherAfterBuild(built({ altHeld: false, pendingSteps: 1 }))).toEqual({ action: 'switch', index: 2 })
  })

  it('drops a build that a later press, Esc or a hide has replaced', () => {
    expect(planSwitcherAfterBuild(built({ isLatestBuild: false }))).toEqual({ action: 'drop' })
    expect(planSwitcherAfterBuild(built({ isLatestBuild: false, altHeld: false }))).toEqual({ action: 'drop' })
  })

  it('drops a build that found no windows', () => {
    expect(planSwitcherAfterBuild(built({ windowCount: 0 }))).toEqual({ action: 'drop' })
    expect(planSwitcherAfterBuild(built({ windowCount: 0, altHeld: false }))).toEqual({ action: 'drop' })
  })
})

describe('isThumbnailStale', () => {
  const now = 1_000_000

  it('is stale when the window was never captured', () => {
    expect(isThumbnailStale(undefined, now)).toBe(true)
    expect(isThumbnailStale(null, now)).toBe(true)
  })

  it('is fresh right after a capture', () => {
    expect(isThumbnailStale({ url: 'data:', ts: now }, now)).toBe(false)
    expect(isThumbnailStale({ url: 'data:', ts: now - THUMBNAIL_STALE_MS + 1 }, now)).toBe(false)
  })

  it('goes stale once the capture is old enough', () => {
    expect(isThumbnailStale({ url: 'data:', ts: now - THUMBNAIL_STALE_MS }, now)).toBe(true)
    expect(isThumbnailStale({ url: 'data:', ts: now - THUMBNAIL_STALE_MS * 4 }, now)).toBe(true)
  })

  it('takes a custom age limit', () => {
    expect(isThumbnailStale({ url: 'data:', ts: now - 500 }, now, 1000)).toBe(false)
    expect(isThumbnailStale({ url: 'data:', ts: now - 1000 }, now, 1000)).toBe(true)
  })
})

describe('isSwitcherWindow', () => {
  it('lists an ordinary visible, titled app window', () => {
    expect(isSwitcherWindow(HWND, windowProbe())).toBe(true)
  })

  it('leaves out hidden, tool, cloaked and untitled windows', () => {
    expect(isSwitcherWindow(HWND, windowProbe({ isVisible: () => false }))).toBe(false)
    expect(isSwitcherWindow(HWND, windowProbe({ exStyle: () => WS_EX_TOOLWINDOW }))).toBe(false)
    expect(isSwitcherWindow(HWND, windowProbe({ isCloaked: () => true }))).toBe(false)
    expect(isSwitcherWindow(HWND, windowProbe({ titleLength: () => 0 }))).toBe(false)
  })

  it("never lists the shell's own topbar, desktop or shell window", () => {
    expect(isSwitcherWindow(HWND, windowProbe({ isShellSurface: () => true }))).toBe(false)
    expect(isSwitcherWindow(HWND, windowProbe({ isShellWindow: () => true }))).toBe(false)
  })

  it('lists an Alpine window only when it is exposed, like Settings or a plugin window', () => {
    expect(isSwitcherWindow(HWND, windowProbe({ isOwnProcess: () => true }))).toBe(false)
    expect(isSwitcherWindow(HWND, windowProbe({ isOwnProcess: () => true, isExposedOwnWindow: () => true }))).toBe(true)
  })

  it('stops probing once a check has ruled the window out', () => {
    const probed = []
    const probe = windowProbe({
      isVisible: () => false,
      exStyle: () => { probed.push('exStyle'); return 0 },
      isOwnProcess: () => { probed.push('isOwnProcess'); return false },
    })
    isSwitcherWindow(HWND, probe)
    expect(probed).toEqual([])
  })
})

describe('switcherKeyAction', () => {
  it('remembers Alt going down and coming back up without swallowing either', () => {
    expect(switcherKeyAction(keyDown(VK_LMENU), switcherState({ altIsDown: false }))).toEqual({ action: null, altIsDown: true, swallow: false })
    expect(switcherKeyAction(keyUp(VK_RMENU), switcherState())).toEqual({ action: null, altIsDown: false, swallow: false })
  })

  it('opens the switcher on Alt+Tab', () => {
    expect(switcherKeyAction(keyDown(VK_TAB), switcherState())).toEqual({ action: 'open', altIsDown: true, swallow: true })
  })

  it('leaves Tab alone when Alt is not down', () => {
    expect(switcherKeyAction(keyDown(VK_TAB), switcherState({ altIsDown: false }))).toEqual({ action: null, altIsDown: false, swallow: false })
  })

  it('cycles forward on Tab and backward on Shift+Tab while open', () => {
    expect(switcherKeyAction(keyDown(VK_TAB), switcherState({ active: true }))).toMatchObject({ action: 'cycleForward', swallow: true })
    expect(switcherKeyAction(keyDown(VK_TAB), switcherState({ active: true, isShiftHeld: () => true }))).toMatchObject({ action: 'cycleBackward', swallow: true })
  })

  it('queues Tab presses that arrive while the window list is still being built', () => {
    expect(switcherKeyAction(keyDown(VK_TAB), switcherState({ building: true }))).toMatchObject({ action: 'queueForward', swallow: true })
    expect(switcherKeyAction(keyDown(VK_TAB), switcherState({ building: true, isShiftHeld: () => true }))).toMatchObject({ action: 'queueBackward', swallow: true })
  })

  it('commits the selection when Alt comes up while the switcher is open', () => {
    expect(switcherKeyAction(keyUp(VK_LMENU), switcherState({ active: true }))).toEqual({ action: 'commit', altIsDown: false, swallow: false })
  })

  it('commits on a Tab press whose Alt release the hook missed', () => {
    const missedRelease = switcherState({ active: true, isAltHeld: () => false })
    expect(switcherKeyAction(keyDown(VK_TAB), missedRelease)).toEqual({ action: 'commit', altIsDown: false, swallow: true })
  })

  it('lets that Tab through when the switcher was never opened', () => {
    const missedRelease = switcherState({ isAltHeld: () => false })
    expect(switcherKeyAction(keyDown(VK_TAB), missedRelease)).toEqual({ action: null, altIsDown: false, swallow: false })
  })

  it('hides on Escape while the switcher is open or still building', () => {
    expect(switcherKeyAction(keyDown(VK_ESCAPE), switcherState({ active: true }))).toEqual({ action: 'hide', altIsDown: false, swallow: true })
    expect(switcherKeyAction(keyDown(VK_ESCAPE), switcherState({ building: true }))).toEqual({ action: 'hide', altIsDown: false, swallow: true })
  })

  it('lets Escape through when the switcher is closed', () => {
    expect(switcherKeyAction(keyDown(VK_ESCAPE), switcherState())).toEqual({ action: null, altIsDown: true, swallow: false })
  })

  it('ignores every other key and Tab releases', () => {
    expect(switcherKeyAction(keyDown(VK_E), switcherState({ active: true }))).toEqual({ action: null, altIsDown: true, swallow: false })
    expect(switcherKeyAction(keyUp(VK_TAB), switcherState({ active: true }))).toEqual({ action: null, altIsDown: true, swallow: false })
  })

  it('only reads the live key state for a Tab press with Alt down', () => {
    const reads = []
    const state = switcherState({
      altIsDown: false,
      isAltHeld: () => { reads.push('alt'); return true },
      isShiftHeld: () => { reads.push('shift'); return false },
    })
    switcherKeyAction(keyDown(VK_TAB), state)
    switcherKeyAction(keyDown(VK_ESCAPE), state)
    switcherKeyAction(keyDown(VK_LMENU), state)
    expect(reads).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import tilingPolicy from './tilingPolicy.js'

const { isCrossDisplayMove, allowsWindow, isManagedWindowBounds, snapHotkeyConfigured, acceptsSnapHotkey } = tilingPolicy

const SNAP_ON = { enabled: true, hotkeys: true, mode: 'snap' }

function target(overrides) {
  return { exists: true, ownProcess: false, exposed: false, hasNeighborDisplay: true, ...overrides }
}

const FOREIGN = target()
const EXPOSED_OWN = target({ ownProcess: true, exposed: true })
const HIDDEN_OWN = target({ ownProcess: true, exposed: false })

describe('allowsWindow', () => {
  it('allows a window belonging to another process', () => {
    expect(allowsWindow(FOREIGN)).toBe(true)
  })

  it('allows an own window that is on the exposed list', () => {
    expect(allowsWindow(EXPOSED_OWN)).toBe(true)
  })

  it('refuses an own window that is not on the exposed list', () => {
    expect(allowsWindow(HIDDEN_OWN)).toBe(false)
  })

  it('refuses a handle that is no longer a window', () => {
    expect(allowsWindow(target({ exists: false }))).toBe(false)
    expect(allowsWindow(null)).toBe(false)
  })
})

describe('isManagedWindowBounds', () => {
  const MONITOR = { left: 0, top: 0, right: 1920, bottom: 1080 }

  it('excludes a borderless window filling the whole monitor', () => {
    expect(isManagedWindowBounds(MONITOR, MONITOR)).toBe(false)
  })

  it('excludes an overhanging borderless fullscreen window', () => {
    expect(isManagedWindowBounds({ left: -8, top: -8, right: 1928, bottom: 1088 }, MONITOR)).toBe(false)
  })

  it('excludes a window spanning beyond its monitor', () => {
    expect(isManagedWindowBounds({ left: 0, top: 0, right: 3840, bottom: 1080 }, MONITOR)).toBe(false)
  })

  it('allows a window filling only the work area', () => {
    expect(isManagedWindowBounds({ left: 0, top: 24, right: 1920, bottom: 1080 }, MONITOR)).toBe(true)
  })

  it('allows a maximized window whose invisible border sits below the monitor top', () => {
    expect(isManagedWindowBounds({ left: -8, top: 16, right: 1928, bottom: 1088 }, MONITOR)).toBe(true)
  })

  it('allows a floating window', () => {
    expect(isManagedWindowBounds({ left: 200, top: 120, right: 1400, bottom: 900 }, MONITOR)).toBe(true)
  })

  it('allows a window when either rect is unavailable', () => {
    expect(isManagedWindowBounds(null, MONITOR)).toBe(true)
    expect(isManagedWindowBounds(MONITOR, null)).toBe(true)
  })
})

describe('isCrossDisplayMove', () => {
  it('is a horizontal move with shift held', () => {
    expect(isCrossDisplayMove('left', true)).toBe(true)
    expect(isCrossDisplayMove('right', true)).toBe(true)
  })

  it('is not a plain horizontal move', () => {
    expect(isCrossDisplayMove('left', false)).toBe(false)
  })

  it('is not a vertical move even with shift held', () => {
    expect(isCrossDisplayMove('up', true)).toBe(false)
    expect(isCrossDisplayMove('down', true)).toBe(false)
  })
})

describe('snapHotkeyConfigured', () => {
  it('accepts every direction while snap hotkeys are on', () => {
    for (const direction of ['left', 'right', 'up', 'down']) {
      expect(snapHotkeyConfigured(SNAP_ON, direction, false)).toBe(true)
    }
  })

  it('refuses when tiling is disabled', () => {
    expect(snapHotkeyConfigured({ ...SNAP_ON, enabled: false }, 'left', false)).toBe(false)
  })

  it('refuses when hotkeys are switched off', () => {
    expect(snapHotkeyConfigured({ ...SNAP_ON, hotkeys: false }, 'left', false)).toBe(false)
  })

  it('refuses in dynamic mode', () => {
    expect(snapHotkeyConfigured({ ...SNAP_ON, mode: 'dynamic' }, 'left', false)).toBe(false)
  })

  it('refuses a vertical move with shift held', () => {
    expect(snapHotkeyConfigured(SNAP_ON, 'up', true)).toBe(false)
  })
})

describe('acceptsSnapHotkey', () => {
  it('acts on a foreign window', () => {
    expect(acceptsSnapHotkey(SNAP_ON, 'left', false, FOREIGN)).toBe(true)
  })

  it('acts on an own window that is on the exposed list', () => {
    expect(acceptsSnapHotkey(SNAP_ON, 'left', false, EXPOSED_OWN)).toBe(true)
  })

  it('does not swallow the key for an own window it would refuse', () => {
    expect(acceptsSnapHotkey(SNAP_ON, 'left', false, HIDDEN_OWN)).toBe(false)
  })

  it('does not swallow the key when there is no foreground window', () => {
    expect(acceptsSnapHotkey(SNAP_ON, 'left', false, target({ exists: false }))).toBe(false)
  })

  it('does not swallow the key when snap hotkeys are off but the window is snappable', () => {
    expect(acceptsSnapHotkey({ ...SNAP_ON, hotkeys: false }, 'left', false, FOREIGN)).toBe(false)
  })

  it('does not swallow a cross-display move with no display on that side', () => {
    expect(acceptsSnapHotkey(SNAP_ON, 'left', true, target({ hasNeighborDisplay: false }))).toBe(false)
  })

  it('acts on a cross-display move when a display is on that side', () => {
    expect(acceptsSnapHotkey(SNAP_ON, 'right', true, FOREIGN)).toBe(true)
    expect(acceptsSnapHotkey(SNAP_ON, 'right', true, EXPOSED_OWN)).toBe(true)
  })

  it('ignores the neighbour display for a plain horizontal snap', () => {
    expect(acceptsSnapHotkey(SNAP_ON, 'left', false, target({ hasNeighborDisplay: false }))).toBe(true)
  })
})

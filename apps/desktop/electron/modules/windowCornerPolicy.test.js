import { describe, it, expect } from 'vitest'
import windowCornerPolicy from './windowCornerPolicy.js'

const {
  DWMWCP_DEFAULT,
  DWMWCP_DONOTROUND,
  DWMWCP_ROUND,
  DWMWCP_ROUNDSMALL,
  coversMonitor,
  shouldApplyCornerPreference,
  deadTrackedWindows,
  restorableTrackedWindows,
} = windowCornerPolicy

const TARGET = DWMWCP_ROUNDSMALL

const MONITOR = { left: 0, top: 0, right: 1920, bottom: 1080 }
const WORK_AREA_FILL = { left: 0, top: 40, right: 1920, bottom: 1080 }
const FLOATING = { left: 300, top: 200, right: 1400, bottom: 900 }

function candidate(overrides) {
  return {
    manageable: true,
    maximized: false,
    preference: DWMWCP_DONOTROUND,
    bounds: FLOATING,
    monitorBounds: MONITOR,
    ...overrides,
  }
}

describe('coversMonitor', () => {
  it('detects a window filling the whole monitor', () => {
    expect(coversMonitor(MONITOR, MONITOR)).toBe(true)
  })

  it('detects a borderless window overhanging the monitor', () => {
    expect(coversMonitor({ left: -8, top: -8, right: 1928, bottom: 1088 }, MONITOR)).toBe(true)
  })

  it('does not count a window filling only the work area', () => {
    expect(coversMonitor(WORK_AREA_FILL, MONITOR)).toBe(false)
  })

  it('does not count a floating window', () => {
    expect(coversMonitor(FLOATING, MONITOR)).toBe(false)
  })

  it('is false when either rect is missing', () => {
    expect(coversMonitor(null, MONITOR)).toBe(false)
    expect(coversMonitor(FLOATING, null)).toBe(false)
  })
})

describe('shouldApplyCornerPreference', () => {
  it('normalises an unmaximized window that opted out', () => {
    expect(shouldApplyCornerPreference(candidate(), TARGET)).toBe(true)
  })

  it('normalises an unmaximized window left on the default preference', () => {
    expect(shouldApplyCornerPreference(candidate({ preference: DWMWCP_DEFAULT }), TARGET)).toBe(true)
  })

  it('normalises a window already rounded at the larger radius', () => {
    expect(shouldApplyCornerPreference(candidate({ preference: DWMWCP_ROUND }), TARGET)).toBe(true)
  })

  it('leaves a maximized window alone', () => {
    expect(shouldApplyCornerPreference(candidate({ maximized: true }), TARGET)).toBe(false)
  })

  it('leaves a borderless fullscreen window alone', () => {
    expect(shouldApplyCornerPreference(candidate({ bounds: MONITOR }), TARGET)).toBe(false)
  })

  it('rounds a window tiled to fill the work area', () => {
    expect(shouldApplyCornerPreference(candidate({ bounds: WORK_AREA_FILL }), TARGET)).toBe(true)
  })

  it('skips a window already at the target radius', () => {
    expect(shouldApplyCornerPreference(candidate({ preference: TARGET }), TARGET)).toBe(false)
  })

  it('skips unmanageable windows', () => {
    expect(shouldApplyCornerPreference(candidate({ manageable: false }), TARGET)).toBe(false)
    expect(shouldApplyCornerPreference(null, TARGET)).toBe(false)
  })
})

describe('tracked window bookkeeping', () => {
  const tracked = new Map([[10, DWMWCP_DONOTROUND], [20, DWMWCP_DEFAULT], [30, DWMWCP_DONOTROUND]])
  const isAlive = (hwnd) => hwnd !== 20

  it('lists the handles whose windows are gone', () => {
    expect(deadTrackedWindows(tracked, isAlive)).toEqual([20])
  })

  it('restores only the windows that still exist', () => {
    expect(restorableTrackedWindows(tracked, isAlive)).toEqual([
      { hwnd: 10, preference: DWMWCP_DONOTROUND },
      { hwnd: 30, preference: DWMWCP_DONOTROUND },
    ])
  })

  it('hands back each window its own original preference', () => {
    const mixed = new Map([[1, DWMWCP_DEFAULT], [2, DWMWCP_DONOTROUND]])
    expect(restorableTrackedWindows(mixed, () => true)).toEqual([
      { hwnd: 1, preference: DWMWCP_DEFAULT },
      { hwnd: 2, preference: DWMWCP_DONOTROUND },
    ])
  })
})

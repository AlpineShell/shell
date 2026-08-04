import { describe, it, expect } from 'vitest'
import appbarGeometry from './appbarGeometry.js'

const {
  rectsMatch,
  reservedWorkArea,
  barHeightForDpi,
  needsWorkAreaUpdate,
  canRestoreWorkArea,
} = appbarGeometry

const LAPTOP = { left: 0, top: 0, right: 1920, bottom: 1080 }
const EXTERNAL = { left: 1920, top: 0, right: 4480, bottom: 1440 }

describe('rectsMatch', () => {
  it('compares every edge', () => {
    expect(rectsMatch(LAPTOP, { ...LAPTOP })).toBe(true)
    expect(rectsMatch(LAPTOP, { ...LAPTOP, top: 40 })).toBe(false)
  })

  it('treats a missing rect as no match', () => {
    expect(rectsMatch(LAPTOP, null)).toBe(false)
    expect(rectsMatch(null, LAPTOP)).toBe(false)
  })
})

describe('reservedWorkArea', () => {
  it('moves only the top edge down by the bar height', () => {
    expect(reservedWorkArea(LAPTOP, 40)).toEqual({ left: 0, top: 40, right: 1920, bottom: 1080 })
  })

  it('keeps the reservation on a monitor with a negative origin', () => {
    const leftOfPrimary = { left: -2560, top: -200, right: 0, bottom: 1240 }
    expect(reservedWorkArea(leftOfPrimary, 50)).toEqual({ left: -2560, top: -150, right: 0, bottom: 1240 })
  })
})

describe('barHeightForDpi', () => {
  it('scales the bar height to the monitor dpi', () => {
    expect(barHeightForDpi(40, 96)).toBe(40)
    expect(barHeightForDpi(40, 144)).toBe(60)
    expect(barHeightForDpi(40, 192)).toBe(80)
  })

  it('falls back to 96 dpi when the dpi is unavailable', () => {
    expect(barHeightForDpi(40, 0)).toBe(40)
    expect(barHeightForDpi(40, undefined)).toBe(40)
  })
})

describe('needsWorkAreaUpdate', () => {
  it('is false once the work area already matches the reservation', () => {
    const reserved = reservedWorkArea(LAPTOP, 40)
    expect(needsWorkAreaUpdate(reserved, reserved)).toBe(false)
  })

  it('is true after Windows resets the work area to the full monitor', () => {
    expect(needsWorkAreaUpdate(LAPTOP, reservedWorkArea(LAPTOP, 40))).toBe(true)
  })

  it('is true when the dpi changed the bar height', () => {
    expect(needsWorkAreaUpdate(reservedWorkArea(LAPTOP, 40), reservedWorkArea(LAPTOP, 60))).toBe(true)
  })
})

describe('canRestoreWorkArea', () => {
  it('refuses to restore when the monitor no longer exists', () => {
    expect(canRestoreWorkArea(null, [])).toBe(false)
  })

  it('refuses to restore onto a monitor another bar still reserves', () => {
    expect(canRestoreWorkArea(LAPTOP, [LAPTOP])).toBe(false)
  })

  it('restores a monitor that no other bar reserves', () => {
    expect(canRestoreWorkArea(EXTERNAL, [LAPTOP])).toBe(true)
  })

  it('restores when no bars remain', () => {
    expect(canRestoreWorkArea(LAPTOP, [])).toBe(true)
    expect(canRestoreWorkArea(LAPTOP, undefined)).toBe(true)
  })
})

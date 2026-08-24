import { describe, it, expect } from 'vitest'
import menuHotZone from './menuHotZone.js'

const { MENU_HOT_MARGIN, isPointInMenuHotZone, shouldClickCloseMenu } = menuHotZone

const PRIMARY_BAR = { x: 0, y: 0, width: 1920, height: 400 }
const RAISED_BAR = { x: 0, y: 0, width: 1920, height: 360 }
const RIGHT_BAR = { x: 1920, y: -120, width: 2560, height: 500 }

const MENU = {
  top: 24,
  bottom: 300,
  left: 800,
  right: 1100,
  contentBounds: { top: 24, bottom: 300, left: 814, right: 1086 },
}

const EDGE_MENU = {
  top: 24,
  bottom: 200,
  left: 0,
  right: 214,
  contentBounds: { top: 24, bottom: 200, left: 0, right: 200 },
}

const TRAY_DRAG = { top: 0, bottom: 120, left: 0, right: 1920 }

describe('isPointInMenuHotZone', () => {
  it('accepts the menu itself', () => {
    expect(isPointInMenuHotZone({ x: 900, y: 200 }, PRIMARY_BAR, MENU)).toBe(true)
  })

  it('accepts the forgiving band around the menu', () => {
    expect(isPointInMenuHotZone({ x: 900, y: 300 + MENU_HOT_MARGIN - 1 }, PRIMARY_BAR, MENU)).toBe(true)
    expect(isPointInMenuHotZone({ x: 800 - MENU_HOT_MARGIN, y: 200 }, PRIMARY_BAR, MENU)).toBe(true)
    expect(isPointInMenuHotZone({ x: 1100 + MENU_HOT_MARGIN - 1, y: 200 }, PRIMARY_BAR, MENU)).toBe(true)
  })

  it('rejects a point beyond the band', () => {
    expect(isPointInMenuHotZone({ x: 900, y: 300 + MENU_HOT_MARGIN }, PRIMARY_BAR, MENU)).toBe(false)
    expect(isPointInMenuHotZone({ x: 800 - MENU_HOT_MARGIN - 1, y: 200 }, PRIMARY_BAR, MENU)).toBe(false)
  })

  it('keeps the band unclamped where it overhangs the raised window', () => {
    expect(isPointInMenuHotZone({ x: 900, y: 363 }, RAISED_BAR, MENU)).toBe(true)
    expect(isPointInMenuHotZone({ x: -10, y: 100 }, PRIMARY_BAR, EDGE_MENU)).toBe(true)
  })

  it('offsets the region by the window origin', () => {
    expect(isPointInMenuHotZone({ x: 900, y: 200 }, RIGHT_BAR, MENU)).toBe(false)
    expect(isPointInMenuHotZone({ x: 1920 + 900, y: -120 + 200 }, RIGHT_BAR, MENU)).toBe(true)
  })

  it('rejects every point when no menu is open', () => {
    expect(isPointInMenuHotZone({ x: 900, y: 200 }, PRIMARY_BAR, null)).toBe(false)
  })
})

describe('shouldClickCloseMenu', () => {
  it('closes on a click in the band below the menu', () => {
    expect(shouldClickCloseMenu({ x: 900, y: 320 }, PRIMARY_BAR, MENU)).toBe(true)
  })

  it('closes on a click in the band beside the menu', () => {
    expect(shouldClickCloseMenu({ x: 760, y: 200 }, PRIMARY_BAR, MENU)).toBe(true)
    expect(shouldClickCloseMenu({ x: 1140, y: 200 }, PRIMARY_BAR, MENU)).toBe(true)
  })

  it('closes on a click in the transparent shoulder flanking the menu body', () => {
    expect(shouldClickCloseMenu({ x: 805, y: 299 }, PRIMARY_BAR, MENU)).toBe(true)
    expect(shouldClickCloseMenu({ x: 1099, y: 299 }, PRIMARY_BAR, MENU)).toBe(true)
    expect(shouldClickCloseMenu({ x: 813, y: 160 }, PRIMARY_BAR, MENU)).toBe(true)
    expect(shouldClickCloseMenu({ x: 1086, y: 160 }, PRIMARY_BAR, MENU)).toBe(true)
  })

  it('leaves a click inside the menu body to the menu', () => {
    expect(shouldClickCloseMenu({ x: 900, y: 200 }, PRIMARY_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 814, y: 24 }, PRIMARY_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 814, y: 299 }, PRIMARY_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 1085, y: 299 }, PRIMARY_BAR, MENU)).toBe(false)
  })

  it('leaves a click on the bar row to the topbar itself', () => {
    expect(shouldClickCloseMenu({ x: 900, y: 0 }, PRIMARY_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 900, y: 23 }, PRIMARY_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 200, y: 12 }, PRIMARY_BAR, MENU)).toBe(false)
  })

  it('ignores a click past the band, where the topbar is click-through', () => {
    expect(shouldClickCloseMenu({ x: 900, y: 300 + MENU_HOT_MARGIN }, PRIMARY_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 400, y: 200 }, PRIMARY_BAR, MENU)).toBe(false)
  })

  it('clamps the band to the bottom of the raised window', () => {
    expect(shouldClickCloseMenu({ x: 900, y: 355 }, RAISED_BAR, MENU)).toBe(true)
    expect(shouldClickCloseMenu({ x: 900, y: 360 }, RAISED_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 900, y: 363 }, RAISED_BAR, MENU)).toBe(false)
  })

  it('clamps the band to the window edge beside an edge-anchored menu', () => {
    expect(shouldClickCloseMenu({ x: 205, y: 100 }, PRIMARY_BAR, EDGE_MENU)).toBe(true)
    expect(shouldClickCloseMenu({ x: -1, y: 100 }, PRIMARY_BAR, EDGE_MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: -10, y: 100 }, PRIMARY_BAR, EDGE_MENU)).toBe(false)
  })

  it('ignores a click on another display, where no menu is open', () => {
    expect(shouldClickCloseMenu({ x: 1920 + 900, y: 320 }, PRIMARY_BAR, MENU)).toBe(false)
    expect(shouldClickCloseMenu({ x: 900, y: 320 }, RIGHT_BAR, MENU)).toBe(false)
  })

  it('closes on the band of a menu opened on a display with a negative origin', () => {
    expect(shouldClickCloseMenu({ x: 1920 + 900, y: -120 + 320 }, RIGHT_BAR, MENU)).toBe(true)
  })

  it('never closes when no menu is open', () => {
    expect(shouldClickCloseMenu({ x: 900, y: 320 }, PRIMARY_BAR, null)).toBe(false)
  })

  it('never closes a region that reports no content bounds', () => {
    expect(shouldClickCloseMenu({ x: 900, y: 12 }, PRIMARY_BAR, TRAY_DRAG)).toBe(false)
    expect(shouldClickCloseMenu({ x: 900, y: 150 }, PRIMARY_BAR, TRAY_DRAG)).toBe(false)
    expect(shouldClickCloseMenu({ x: 900, y: 200 }, PRIMARY_BAR, { top: 24, bottom: 300, left: 800, right: 1100 })).toBe(false)
  })
})

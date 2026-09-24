import { describe, expect, it } from 'vitest'
import openWithPlacementPolicy from './openWithPlacementPolicy.js'

const { isOpenWithClass, isOpenWithDialog, isInsideWorkArea, centeredInWorkArea, planOpenWithPlacement } = openWithPlacementPolicy

const PRIMARY_WORK_AREA = { left: 0, top: 48, right: 2880, bottom: 1800 }
const LEFT_MONITOR_WORK_AREA = { left: -1920, top: 0, right: 0, bottom: 1040 }
const DIALOG_WIDTH = 896
const DIALOG_HEIGHT = 1248

function centredOnOrigin() {
  return { left: -DIALOG_WIDTH / 2, top: -DIALOG_HEIGHT / 2, right: DIALOG_WIDTH / 2, bottom: DIALOG_HEIGHT / 2 }
}

describe('isOpenWithDialog', () => {
  it('recognises the Windows app picker window', () => {
    expect(isOpenWithDialog({ className: 'Open With', processName: 'OpenWith' })).toBe(true)
  })

  it('checks the cheap class name on its own before the process is looked up', () => {
    expect(isOpenWithClass('Open With')).toBe(true)
    expect(isOpenWithClass('Chrome_WidgetWin_1')).toBe(false)
  })

  it('leaves every other window alone', () => {
    expect(isOpenWithDialog({ className: 'Open With', processName: 'notepad' })).toBe(false)
    expect(isOpenWithDialog({ className: '#32770', processName: 'OpenWith' })).toBe(false)
    expect(isOpenWithDialog({ className: 'Open With', processName: null })).toBe(false)
  })
})

describe('isInsideWorkArea', () => {
  it('accepts a window that fits inside, edges included', () => {
    expect(isInsideWorkArea({ left: 0, top: 48, right: 2880, bottom: 1800 }, PRIMARY_WORK_AREA)).toBe(true)
  })

  it('rejects a window that pokes out on any side', () => {
    expect(isInsideWorkArea({ left: 100, top: 20, right: 500, bottom: 400 }, PRIMARY_WORK_AREA)).toBe(false)
    expect(isInsideWorkArea({ left: -1, top: 100, right: 500, bottom: 400 }, PRIMARY_WORK_AREA)).toBe(false)
  })
})

describe('centeredInWorkArea', () => {
  it('centres the window in the work area', () => {
    expect(centeredInWorkArea({ left: 0, top: 0, right: 880, bottom: 1000 }, PRIMARY_WORK_AREA)).toEqual({ x: 1000, y: 424 })
  })

  it('keeps the top-left corner on screen when the window is taller than the work area', () => {
    expect(centeredInWorkArea({ left: 0, top: 0, right: 800, bottom: 2400 }, PRIMARY_WORK_AREA)).toEqual({ x: 1040, y: 48 })
  })

  it('works on a monitor left of the primary one', () => {
    expect(centeredInWorkArea({ left: 0, top: 0, right: 920, bottom: 1000 }, LEFT_MONITOR_WORK_AREA)).toEqual({ x: -1420, y: 20 })
  })
})

describe('planOpenWithPlacement', () => {
  it('pulls the picker Windows centred on the screen origin back into the work area under the cursor', () => {
    expect(planOpenWithPlacement({
      rect: centredOnOrigin(),
      nearestWorkArea: PRIMARY_WORK_AREA,
      cursorWorkArea: PRIMARY_WORK_AREA,
    })).toEqual({ x: 992, y: 300 })
  })

  it('leaves a picker that already sits inside its monitor’s work area where it is', () => {
    expect(planOpenWithPlacement({
      rect: { left: -1400, top: 20, right: -504, bottom: 1020 },
      nearestWorkArea: LEFT_MONITOR_WORK_AREA,
      cursorWorkArea: PRIMARY_WORK_AREA,
    })).toBe(null)
  })

  it('falls back to the nearest monitor when the cursor’s monitor is unknown', () => {
    expect(planOpenWithPlacement({
      rect: centredOnOrigin(),
      nearestWorkArea: PRIMARY_WORK_AREA,
      cursorWorkArea: null,
    })).toEqual({ x: 992, y: 300 })
  })

  it('does nothing without a usable window rect or work area', () => {
    expect(planOpenWithPlacement({ rect: null, nearestWorkArea: PRIMARY_WORK_AREA, cursorWorkArea: PRIMARY_WORK_AREA })).toBe(null)
    expect(planOpenWithPlacement({ rect: { left: 0, top: 0, right: 0, bottom: 0 }, nearestWorkArea: PRIMARY_WORK_AREA, cursorWorkArea: null })).toBe(null)
    expect(planOpenWithPlacement({ rect: centredOnOrigin(), nearestWorkArea: null, cursorWorkArea: null })).toBe(null)
  })

  it('does not move a window that cannot fit and is already as far in as it goes', () => {
    expect(planOpenWithPlacement({
      rect: { left: 1040, top: 48, right: 1840, bottom: 2448 },
      nearestWorkArea: PRIMARY_WORK_AREA,
      cursorWorkArea: PRIMARY_WORK_AREA,
    })).toBe(null)
  })
})

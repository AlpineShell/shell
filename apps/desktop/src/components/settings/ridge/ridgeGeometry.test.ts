import { describe, it, expect } from 'vitest'
import {
  caretBox,
  edgeScrollDelta,
  insertionIndexInLane,
  resolveDropTarget,
  ridgeFitScale,
  ridgeLayoutMode,
} from './ridgeGeometry'

const MINIMUM_CANVAS_WIDTH = 525

const box = (left: number, top: number, right: number, bottom: number): RidgeBox => ({ left, top, right, bottom })
const chip = (id: TopbarItemId, left: number, right: number, top = 100, bottom = 132): RidgeChipBox => ({
  id,
  left,
  top,
  right,
  bottom,
})
const lane = (slot: TopbarSlot, frame: RidgeBox, chips: RidgeChipBox[] = []): RidgeLaneBox => ({
  slot,
  ...frame,
  chips,
})

const LEFT_LANE = lane('left', box(0, 0, MINIMUM_CANVAS_WIDTH, 40), [
  chip('system-menu', 8, 40, 4, 36),
  chip('plugins-left', 44, 76, 4, 36),
])
const CENTER_LANE = lane('center', box(0, 48, MINIMUM_CANVAS_WIDTH, 88), [chip('launcher', 246, 278, 52, 84)])
const RIGHT_LANE = lane('right', box(0, 96, MINIMUM_CANVAS_WIDTH, 136), [
  chip('tray', 8, 40),
  chip('media', 44, 76),
  chip('microphone', 80, 112),
  chip('status', 116, 148),
  chip('plugins-right', 152, 184),
  chip('clock', 188, 240),
])
const WRAPPED_LANE = lane('right', box(0, 96, 320, 164), [
  chip('tray', 8, 100, 100, 128),
  chip('media', 108, 200, 100, 128),
  chip('microphone', 208, 300, 100, 128),
  chip('status', 8, 100, 132, 160),
  chip('clock', 108, 200, 132, 160),
])
const STACKED: RidgeDragGeometry = {
  lanes: [LEFT_LANE, CENTER_LANE, RIGHT_LANE],
  hideZone: box(0, 144, MINIMUM_CANVAS_WIDTH, 184),
}
const SCROLLER = box(240, 100, 765, 660)

describe('ridgeLayoutMode', () => {
  it.each([
    [0, 'stacked'],
    [525, 'stacked'],
    [535, 'stacked'],
    [703, 'stacked'],
    [704, 'strip'],
    [1015, 'strip'],
  ] as const)('lays a %ipx canvas out as %s', (width, mode) => {
    expect(ridgeLayoutMode(width)).toBe(mode)
  })
})

describe('insertionIndexInLane', () => {
  it('counts the chips whose middle lies before the pointer', () => {
    expect(insertionIndexInLane(RIGHT_LANE, { x: 70, y: 116 }, 'plugins-left')).toBe(2)
  })

  it('puts the item first before every chip and last past them all', () => {
    expect(insertionIndexInLane(RIGHT_LANE, { x: 4, y: 116 }, 'plugins-left')).toBe(0)
    expect(insertionIndexInLane(RIGHT_LANE, { x: 500, y: 116 }, 'plugins-left')).toBe(6)
  })

  it('leaves the dragged chip out of the count', () => {
    expect(insertionIndexInLane(RIGHT_LANE, { x: 70, y: 116 }, 'tray')).toBe(1)
    expect(insertionIndexInLane(RIGHT_LANE, { x: 500, y: 116 }, 'clock')).toBe(5)
  })

  it('reads a wrapped lane row by row', () => {
    expect(insertionIndexInLane(WRAPPED_LANE, { x: 250, y: 114 }, 'plugins-right')).toBe(2)
    expect(insertionIndexInLane(WRAPPED_LANE, { x: 50, y: 146 }, 'plugins-right')).toBe(3)
    expect(insertionIndexInLane(WRAPPED_LANE, { x: 150, y: 146 }, 'plugins-right')).toBe(4)
    expect(insertionIndexInLane(WRAPPED_LANE, { x: 310, y: 146 }, 'plugins-right')).toBe(5)
  })

  it('takes the nearest row when the pointer sits in the lane padding', () => {
    expect(insertionIndexInLane(RIGHT_LANE, { x: 500, y: 98 }, 'plugins-left')).toBe(6)
    expect(insertionIndexInLane(WRAPPED_LANE, { x: 310, y: 98 }, 'plugins-right')).toBe(3)
    expect(insertionIndexInLane(WRAPPED_LANE, { x: 310, y: 162 }, 'plugins-right')).toBe(5)
  })

  it('returns 0 in an empty lane', () => {
    expect(insertionIndexInLane(lane('center', box(0, 48, 525, 88)), { x: 300, y: 60 }, 'clock')).toBe(0)
  })
})

describe('resolveDropTarget', () => {
  it('names the side and the index under the pointer', () => {
    expect(resolveDropTarget(STACKED, { x: 70, y: 116 }, 'clock')).toEqual({ kind: 'lane', slot: 'right', index: 2 })
    expect(resolveDropTarget(STACKED, { x: 300, y: 60 }, 'clock')).toEqual({ kind: 'lane', slot: 'center', index: 1 })
  })

  it('hides the item when the pointer is on the hide zone', () => {
    expect(resolveDropTarget(STACKED, { x: 200, y: 160 }, 'clock')).toEqual({ kind: 'hide' })
  })

  it('lets the hide zone win over a lane it overlaps', () => {
    const overlapping: RidgeDragGeometry = { ...STACKED, hideZone: box(0, 120, MINIMUM_CANVAS_WIDTH, 184) }

    expect(resolveDropTarget(overlapping, { x: 70, y: 125 }, 'clock')).toEqual({ kind: 'hide' })
  })

  it('accepts a plugin group over any side', () => {
    expect(resolveDropTarget(STACKED, { x: 300, y: 60 }, 'plugins-right')).toEqual({ kind: 'lane', slot: 'center', index: 1 })
    expect(resolveDropTarget(STACKED, { x: 300, y: 20 }, 'plugins-right')).toEqual({ kind: 'lane', slot: 'left', index: 2 })
  })

  it('accepts a plugin group over its own side', () => {
    expect(resolveDropTarget(STACKED, { x: 500, y: 116 }, 'plugins-right')).toEqual({
      kind: 'lane',
      slot: 'right',
      index: 5,
    })
  })

  it('returns null between lanes and outside the canvas', () => {
    expect(resolveDropTarget(STACKED, { x: 200, y: 44 }, 'clock')).toBeNull()
    expect(resolveDropTarget(STACKED, { x: 600, y: 116 }, 'clock')).toBeNull()
  })

  it('returns null without a hide zone when no lane is under the pointer', () => {
    expect(resolveDropTarget({ lanes: [RIGHT_LANE], hideZone: null }, { x: 200, y: 160 }, 'clock')).toBeNull()
  })
})

describe('caretBox', () => {
  it('sits halfway between two chips on one row', () => {
    expect(caretBox(RIGHT_LANE, 1, 'clock')).toEqual(box(41, 100, 43, 132))
  })

  it('sits just before the first chip and just after the last', () => {
    expect(caretBox(RIGHT_LANE, 0, 'clock')).toEqual(box(5, 100, 7, 132))
    expect(caretBox(RIGHT_LANE, 5, 'clock')).toEqual(box(185, 100, 187, 132))
  })

  it('leaves the dragged chip out', () => {
    expect(caretBox(RIGHT_LANE, 0, 'tray')).toEqual(box(41, 100, 43, 132))
  })

  it('starts the next row at a wrap', () => {
    expect(caretBox(WRAPPED_LANE, 3, 'plugins-right')).toEqual(box(5, 132, 7, 160))
  })

  it('clamps an index outside the lane to its ends', () => {
    expect(caretBox(RIGHT_LANE, 99, 'plugins-left')).toEqual(box(241, 100, 243, 132))
    expect(caretBox(RIGHT_LANE, -3, 'plugins-left')).toEqual(box(5, 100, 7, 132))
  })

  it('stays inside the lane', () => {
    const flush = lane('left', box(0, 0, MINIMUM_CANVAS_WIDTH, 40), [chip('system-menu', 0, 120, 4, 36)])

    expect(caretBox(flush, 0, 'clock')).toEqual(box(0, 4, 2, 36))
  })

  it('lines up with its side in an empty lane', () => {
    expect(caretBox(lane('left', box(0, 0, 525, 40)), 0, 'clock')).toEqual(box(1, 0, 3, 40))
    expect(caretBox(lane('center', box(0, 48, 525, 88)), 0, 'clock')).toEqual(box(261.5, 48, 263.5, 88))
    expect(caretBox(lane('right', box(0, 96, 525, 136)), 0, 'clock')).toEqual(box(522, 96, 524, 136))
  })
})

describe('edgeScrollDelta', () => {
  it.each([
    [380, 0],
    [140, 0],
    [139, -1],
    [120, -6],
    [100, -12],
    [60, -12],
    [620, 0],
    [621, 1],
    [640, 6],
    [660, 12],
    [700, 12],
  ])('scrolls by the right amount with the pointer at y=%i (%i)', (y, delta) => {
    expect(edgeScrollDelta({ x: 400, y }, SCROLLER)).toBe(delta)
  })

  it('ignores where the pointer is across the scroller', () => {
    expect(edgeScrollDelta({ x: -500, y: 120 }, SCROLLER)).toBe(-6)
  })
})

describe('ridgeFitScale', () => {
  it('leaves Ridge at full size while it fits', () => {
    expect(ridgeFitScale(1015, 800)).toBe(1)
    expect(ridgeFitScale(800, 800)).toBe(1)
  })

  it('shrinks Ridge by just enough to fit a narrower canvas', () => {
    expect(ridgeFitScale(400, 800)).toBe(0.5)
  })

  it('leaves Ridge at full size before it has been measured', () => {
    expect(ridgeFitScale(400, 0)).toBe(1)
  })
})

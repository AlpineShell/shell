import { describe, it, expect } from 'vitest'
import occlusionPolicy from './occlusionPolicy.js'

const {
  VISIBLE_AREA_TOLERANCE_PX,
  VISIBILITY_VISIBLE,
  VISIBILITY_OCCLUDED,
  VISIBILITY_OFFSCREEN,
  VISIBILITY_HIDDEN,
  isEmptyRect,
  area,
  totalArea,
  intersect,
  subtractRect,
  subtractRects,
  clipToMonitors,
  remainderAfterCutters,
  paintsOverOtherWindows,
  classifyWindowVisibility,
  computeWindowVisibility,
  coversMonitor,
} = occlusionPolicy

function rect(left, top, right, bottom) {
  return { left, top, right, bottom }
}

const PRIMARY = rect(0, 0, 1920, 1080)
const SECONDARY = rect(1920, 0, 3840, 1080)
const BOTH_MONITORS = [PRIMARY, SECONDARY]
const PARKED = rect(-32000, -32000, -31000, -31000)
const TARGET = rect(0, 0, 1000, 1000)

function overlappingPairs(rects) {
  const pairs = []
  for (let outer = 0; outer < rects.length; outer++) {
    for (let inner = outer + 1; inner < rects.length; inner++) {
      if (intersect(rects[outer], rects[inner])) pairs.push([outer, inner])
    }
  }
  return pairs
}

function subtractConserving(target, cutter) {
  const pieces = subtractRect(target, cutter)
  expect(totalArea(pieces)).toBe(area(target) - area(intersect(target, cutter)))
  expect(overlappingPairs(pieces)).toEqual([])
  return pieces
}

function windowSample(overrides) {
  return {
    hwnd: 1,
    minimized: false,
    cloaked: false,
    transparent: false,
    toolWindow: false,
    bounds: rect(100, 100, 600, 600),
    ...overrides,
  }
}

describe('isEmptyRect', () => {
  it('accepts a rect with positive extent', () => {
    expect(isEmptyRect(rect(0, 0, 10, 10))).toBe(false)
  })

  it('treats a zero-width or zero-height rect as empty', () => {
    expect(isEmptyRect(rect(5, 0, 5, 10))).toBe(true)
    expect(isEmptyRect(rect(0, 5, 10, 5))).toBe(true)
    expect(isEmptyRect(rect(0, 0, 0, 0))).toBe(true)
  })

  it('treats an inverted rect as empty', () => {
    expect(isEmptyRect(rect(10, 0, 0, 10))).toBe(true)
    expect(isEmptyRect(rect(0, 10, 10, 0))).toBe(true)
  })

  it('accepts a rect living entirely in negative coordinates', () => {
    expect(isEmptyRect(rect(-100, -100, -50, -50))).toBe(false)
  })

  it('treats a rect with a non-finite edge as empty', () => {
    expect(isEmptyRect(rect(0, 0, Number.POSITIVE_INFINITY, 10))).toBe(true)
    expect(isEmptyRect(rect(0, 0, 10, Number.NaN))).toBe(true)
    expect(isEmptyRect(rect(null, 0, 10, 10))).toBe(true)
    expect(isEmptyRect({ left: 0, top: 0, right: 10 })).toBe(true)
  })

  it('treats a missing rect as empty', () => {
    expect(isEmptyRect(null)).toBe(true)
    expect(isEmptyRect(undefined)).toBe(true)
  })
})

describe('area', () => {
  it('multiplies the two extents', () => {
    expect(area(rect(0, 0, 10, 4))).toBe(40)
  })

  it('measures a rect in negative coordinates as positive', () => {
    expect(area(rect(-100, -100, -50, -50))).toBe(2500)
  })

  it('reports zero for empty, inverted, non-finite and missing rects', () => {
    expect(area(rect(5, 5, 5, 5))).toBe(0)
    expect(area(rect(10, 0, 0, 10))).toBe(0)
    expect(area(rect(0, 0, Number.POSITIVE_INFINITY, 10))).toBe(0)
    expect(area(null)).toBe(0)
  })
})

describe('totalArea', () => {
  it('sums every piece', () => {
    expect(totalArea([rect(0, 0, 10, 10), rect(20, 0, 30, 10)])).toBe(200)
  })

  it('skips empty and non-finite pieces', () => {
    expect(totalArea([rect(0, 0, 10, 10), rect(5, 5, 5, 5), rect(0, 0, Number.NaN, 10)])).toBe(100)
  })

  it('reports zero for an empty or missing list', () => {
    expect(totalArea([])).toBe(0)
    expect(totalArea(null)).toBe(0)
    expect(totalArea(undefined)).toBe(0)
  })
})

describe('intersect', () => {
  it('clips two overlapping rects to their shared area', () => {
    expect(intersect(rect(0, 0, 10, 10), rect(5, 5, 20, 20))).toEqual(rect(5, 5, 10, 10))
  })

  it('returns null for rects that only touch along an edge', () => {
    expect(intersect(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(null)
    expect(intersect(rect(0, 0, 10, 10), rect(0, 10, 10, 20))).toBe(null)
  })

  it('returns null for rects that meet at a single corner', () => {
    expect(intersect(rect(0, 0, 10, 10), rect(10, 10, 20, 20))).toBe(null)
  })

  it('returns null when the rects are apart', () => {
    expect(intersect(rect(0, 0, 10, 10), rect(50, 50, 60, 60))).toBe(null)
  })

  it('returns null when either side is empty, inverted or missing', () => {
    expect(intersect(rect(0, 0, 10, 10), rect(5, 5, 5, 5))).toBe(null)
    expect(intersect(rect(10, 0, 0, 10), rect(0, 0, 10, 10))).toBe(null)
    expect(intersect(rect(0, 0, 10, 10), null)).toBe(null)
    expect(intersect(null, null)).toBe(null)
  })

  it('returns the inner rect when one contains the other', () => {
    expect(intersect(rect(0, 0, 100, 100), rect(10, 10, 20, 20))).toEqual(rect(10, 10, 20, 20))
  })

  it('clips rects sitting in negative coordinates', () => {
    expect(intersect(rect(-100, -100, 0, 0), rect(-50, -50, 50, 50))).toEqual(rect(-50, -50, 0, 0))
  })

  it('is commutative', () => {
    const first = rect(0, 0, 30, 40)
    const second = rect(10, -5, 90, 20)
    expect(intersect(first, second)).toEqual(intersect(second, first))
  })
})

describe('subtractRect', () => {
  it('returns nothing when the cutter swallows the target', () => {
    expect(subtractConserving(TARGET, rect(-10, -10, 2000, 2000))).toEqual([])
    expect(subtractConserving(TARGET, TARGET)).toEqual([])
  })

  it('returns the target untouched when the cutter misses it', () => {
    expect(subtractConserving(TARGET, rect(2000, 2000, 3000, 3000))).toEqual([TARGET])
    expect(subtractConserving(TARGET, null)).toEqual([TARGET])
  })

  it('returns the target untouched when the cutter only touches an edge', () => {
    expect(subtractConserving(TARGET, rect(1000, 0, 1500, 1000))).toEqual([TARGET])
  })

  it('returns nothing for an empty or missing target', () => {
    expect(subtractRect(rect(5, 5, 5, 5), TARGET)).toEqual([])
    expect(subtractRect(null, TARGET)).toEqual([])
  })

  it('cuts a hole in the middle into exactly four pieces', () => {
    const pieces = subtractConserving(TARGET, rect(400, 400, 600, 600))
    expect(pieces).toHaveLength(4)
    expect(totalArea(pieces)).toBe(1000 * 1000 - 200 * 200)
  })

  it('leaves one piece when a full-height strip is cut off the left', () => {
    expect(subtractConserving(TARGET, rect(-50, -50, 300, 1050))).toEqual([rect(300, 0, 1000, 1000)])
  })

  it('leaves one piece when a full-height strip is cut off the right', () => {
    expect(subtractConserving(TARGET, rect(700, -50, 1050, 1050))).toEqual([rect(0, 0, 700, 1000)])
  })

  it('leaves one piece when a full-width strip is cut off the top', () => {
    expect(subtractConserving(TARGET, rect(-50, -50, 1050, 250))).toEqual([rect(0, 250, 1000, 1000)])
  })

  it('leaves one piece when a full-width strip is cut off the bottom', () => {
    expect(subtractConserving(TARGET, rect(-50, 800, 1050, 1050))).toEqual([rect(0, 0, 1000, 800)])
  })

  it('leaves two pieces when a corner is bitten out', () => {
    const pieces = subtractConserving(TARGET, rect(-50, -50, 400, 300))
    expect(pieces).toHaveLength(2)
    expect(totalArea(pieces)).toBe(1000 * 1000 - 400 * 300)
  })

  it('leaves three pieces when a notch is cut into one edge', () => {
    const pieces = subtractConserving(TARGET, rect(-50, 300, 400, 700))
    expect(pieces).toHaveLength(3)
    expect(totalArea(pieces)).toBe(1000 * 1000 - 400 * 400)
  })

  it('conserves area when the target sits in negative coordinates', () => {
    const pieces = subtractConserving(rect(-500, -500, -100, -100), rect(-300, -300, 900, 900))
    expect(pieces).toHaveLength(2)
    expect(totalArea(pieces)).toBe(400 * 400 - 200 * 200)
  })
})

describe('subtractRects', () => {
  it('applies one cutter to every target', () => {
    const targets = [rect(0, 0, 100, 100), rect(200, 0, 300, 100)]
    const remaining = subtractRects(targets, rect(50, -10, 250, 110))
    expect(totalArea(remaining)).toBe(20000 - 5000 - 5000)
    expect(overlappingPairs(remaining)).toEqual([])
  })

  it('leaves untouched targets exactly as they were', () => {
    const targets = [rect(0, 0, 100, 100), rect(500, 500, 600, 600)]
    expect(subtractRects(targets, rect(700, 700, 800, 800))).toEqual(targets)
  })

  it('returns nothing when the cutter covers every target', () => {
    const targets = [rect(0, 0, 100, 100), rect(200, 0, 300, 100)]
    expect(subtractRects(targets, rect(-10, -10, 400, 400))).toEqual([])
  })
})

describe('remainderAfterCutters', () => {
  it('returns the pieces unchanged when there are no cutters', () => {
    expect(remainderAfterCutters([TARGET], [])).toEqual([TARGET])
  })

  it('never removes more than the union of two overlapping cutters', () => {
    const remaining = remainderAfterCutters([TARGET], [rect(0, 0, 600, 1000), rect(400, 0, 800, 1000)])
    expect(totalArea(remaining)).toBe(200 * 1000)
    expect(overlappingPairs(remaining)).toEqual([])
  })

  it('clears the target when two overlapping cutters span it together', () => {
    expect(remainderAfterCutters([TARGET], [rect(0, 0, 600, 1000), rect(400, 0, 1000, 1000)])).toEqual([])
  })

  it('clears the target when two abutting cutters span it together', () => {
    expect(remainderAfterCutters([TARGET], [rect(0, 0, 500, 1000), rect(500, 0, 1000, 1000)])).toEqual([])
  })

  it('keeps the remainder disjoint and correct across many cutters', () => {
    const cutters = [
      rect(100, 100, 300, 300),
      rect(250, 250, 450, 450),
      rect(0, 900, 1000, 1000),
      rect(900, 0, 1000, 1000),
    ]
    const remaining = remainderAfterCutters([TARGET], cutters)
    expect(overlappingPairs(remaining)).toEqual([])
    expect(totalArea(remaining)).toBe(1000000 - 267500)
  })

  it('stops early once nothing is left', () => {
    expect(remainderAfterCutters([], [TARGET])).toEqual([])
  })
})

describe('clipToMonitors', () => {
  it('splits a window spanning two monitors into one piece per monitor', () => {
    const pieces = clipToMonitors(rect(1500, 100, 2500, 600), BOTH_MONITORS)
    expect(pieces).toEqual([rect(1500, 100, 1920, 600), rect(1920, 100, 2500, 600)])
    expect(totalArea(pieces)).toBe(1000 * 500)
  })

  it('returns nothing for a window parked far off every monitor', () => {
    expect(clipToMonitors(PARKED, BOTH_MONITORS)).toEqual([])
  })

  it('trims a window hanging off the left edge', () => {
    expect(clipToMonitors(rect(-200, 100, 300, 500), [PRIMARY])).toEqual([rect(0, 100, 300, 500)])
  })

  it('trims a window hanging off the top edge', () => {
    expect(clipToMonitors(rect(100, -50, 300, 500), [PRIMARY])).toEqual([rect(100, 0, 300, 500)])
  })

  it('returns nothing when the monitor list is empty or missing', () => {
    expect(clipToMonitors(rect(0, 0, 100, 100), [])).toEqual([])
    expect(clipToMonitors(rect(0, 0, 100, 100), null)).toEqual([])
  })

  it('returns nothing for an empty window', () => {
    expect(clipToMonitors(rect(5, 5, 5, 5), BOTH_MONITORS)).toEqual([])
  })
})

describe('paintsOverOtherWindows', () => {
  it('counts a normal window', () => {
    expect(paintsOverOtherWindows(windowSample())).toBe(true)
  })

  it('ignores a minimized window', () => {
    expect(paintsOverOtherWindows(windowSample({ minimized: true }))).toBe(false)
  })

  it('ignores a cloaked window', () => {
    expect(paintsOverOtherWindows(windowSample({ cloaked: true }))).toBe(false)
  })

  it('ignores a transparent window', () => {
    expect(paintsOverOtherWindows(windowSample({ transparent: true }))).toBe(false)
  })

  it('ignores a tool window', () => {
    expect(paintsOverOtherWindows(windowSample({ toolWindow: true }))).toBe(false)
  })

  it('ignores a window with empty or missing bounds', () => {
    expect(paintsOverOtherWindows(windowSample({ bounds: rect(10, 10, 10, 10) }))).toBe(false)
    expect(paintsOverOtherWindows(windowSample({ bounds: null }))).toBe(false)
  })

  it('ignores a missing window', () => {
    expect(paintsOverOtherWindows(null)).toBe(false)
  })
})

describe('classifyWindowVisibility', () => {
  const tolerance = VISIBLE_AREA_TOLERANCE_PX

  it('reports a window nothing covers as visible', () => {
    expect(classifyWindowVisibility(windowSample(), [], [PRIMARY], tolerance)).toBe(VISIBILITY_VISIBLE)
  })

  it('reports a window one cutter covers exactly as occluded', () => {
    const window = windowSample({ bounds: TARGET })
    expect(classifyWindowVisibility(window, [TARGET], [PRIMARY], tolerance)).toBe(VISIBILITY_OCCLUDED)
  })

  it('reports a window as occluded when two cutters cover it together though neither does alone', () => {
    const window = windowSample({ bounds: TARGET })
    const leftHalf = rect(0, 0, 500, 1000)
    const rightHalf = rect(500, 0, 1000, 1000)
    expect(classifyWindowVisibility(window, [leftHalf], [PRIMARY], tolerance)).toBe(VISIBILITY_VISIBLE)
    expect(classifyWindowVisibility(window, [rightHalf], [PRIMARY], tolerance)).toBe(VISIBILITY_VISIBLE)
    expect(classifyWindowVisibility(window, [leftHalf, rightHalf], [PRIMARY], tolerance)).toBe(VISIBILITY_OCCLUDED)
  })

  it('reports a window as occluded when four cutters box it in from every edge', () => {
    const window = windowSample({ bounds: TARGET })
    const cutters = [
      rect(-10, -10, 1010, 400),
      rect(-10, 400, 400, 1010),
      rect(400, 700, 1010, 1010),
      rect(400, 400, 1010, 700),
    ]
    cutters.forEach((cutter) => {
      expect(classifyWindowVisibility(window, [cutter], [PRIMARY], tolerance)).toBe(VISIBILITY_VISIBLE)
    })
    expect(classifyWindowVisibility(window, cutters, [PRIMARY], tolerance)).toBe(VISIBILITY_OCCLUDED)
  })

  it('reports a minimized or cloaked window as hidden before looking at cutters', () => {
    expect(classifyWindowVisibility(windowSample({ minimized: true }), [], [PRIMARY], tolerance))
      .toBe(VISIBILITY_HIDDEN)
    expect(classifyWindowVisibility(windowSample({ cloaked: true }), [], [PRIMARY], tolerance))
      .toBe(VISIBILITY_HIDDEN)
  })

  it('reports a window with empty or missing bounds as hidden', () => {
    expect(classifyWindowVisibility(windowSample({ bounds: rect(0, 0, 0, 0) }), [], [PRIMARY], tolerance))
      .toBe(VISIBILITY_HIDDEN)
    expect(classifyWindowVisibility(windowSample({ bounds: null }), [], [PRIMARY], tolerance)).toBe(VISIBILITY_HIDDEN)
    expect(classifyWindowVisibility(null, [], [PRIMARY], tolerance)).toBe(VISIBILITY_HIDDEN)
  })

  it('reports a window parked off every monitor as offscreen', () => {
    expect(classifyWindowVisibility(windowSample({ bounds: PARKED }), [], BOTH_MONITORS, tolerance))
      .toBe(VISIBILITY_OFFSCREEN)
  })

  it('keeps a window visible when no monitors are known, rather than throttling the whole desktop', () => {
    expect(classifyWindowVisibility(windowSample(), [], [], tolerance)).toBe(VISIBILITY_VISIBLE)
    expect(classifyWindowVisibility(windowSample(), [], null, tolerance)).toBe(VISIBILITY_VISIBLE)
  })

  it('still reports a parked window as offscreen while monitors are known', () => {
    const parked = windowSample({ bounds: rect(-32000, -32000, -31000, -31000) })
    expect(classifyWindowVisibility(parked, [], [PRIMARY], tolerance)).toBe(VISIBILITY_OFFSCREEN)
  })

  it('keeps a window visible while a sliver larger than the tolerance survives', () => {
    const window = windowSample({ bounds: rect(0, 0, 500, 1000) })
    expect(classifyWindowVisibility(window, [rect(0, 0, 500, 994)], [PRIMARY], tolerance)).toBe(VISIBILITY_VISIBLE)
  })

  it('occludes a window whose surviving sliver is smaller than the tolerance', () => {
    const window = windowSample({ bounds: rect(0, 0, 500, 1000) })
    expect(classifyWindowVisibility(window, [rect(0, 0, 500, 996)], [PRIMARY], tolerance)).toBe(VISIBILITY_OCCLUDED)
  })

  it('occludes a window whose surviving sliver equals the tolerance exactly', () => {
    const window = windowSample({ bounds: rect(0, 0, 500, 1000) })
    expect(classifyWindowVisibility(window, [rect(0, 0, 500, 995)], [PRIMARY], tolerance)).toBe(VISIBILITY_OCCLUDED)
  })

  it('honours a tolerance stricter or looser than the default', () => {
    const window = windowSample({ bounds: rect(0, 0, 500, 1000) })
    const cutters = [rect(0, 0, 500, 996)]
    expect(classifyWindowVisibility(window, cutters, [PRIMARY], 1000)).toBe(VISIBILITY_VISIBLE)
    expect(classifyWindowVisibility(window, cutters, [PRIMARY], 10000)).toBe(VISIBILITY_OCCLUDED)
  })

  it('only counts the part of a window that lies on a monitor', () => {
    const window = windowSample({ bounds: rect(-1000, 0, 100, 100) })
    expect(classifyWindowVisibility(window, [], [PRIMARY], tolerance)).toBe(VISIBILITY_VISIBLE)
    expect(classifyWindowVisibility(window, [rect(0, 0, 100, 100)], [PRIMARY], tolerance)).toBe(VISIBILITY_OCCLUDED)
  })

  it('falls back to the default tolerance when called without one', () => {
    expect(classifyWindowVisibility(windowSample(), [], [PRIMARY], undefined)).toBe(VISIBILITY_VISIBLE)
    expect(classifyWindowVisibility(windowSample(), [], [PRIMARY], Number.NaN)).toBe(VISIBILITY_VISIBLE)
    expect(classifyWindowVisibility(windowSample(), [], [PRIMARY], null)).toBe(VISIBILITY_VISIBLE)
  })
})

describe('computeWindowVisibility', () => {
  it('always leaves the topmost window visible', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PRIMARY }),
      windowSample({ hwnd: 2, bounds: PRIMARY }),
    ], [PRIMARY])
    expect(results.map((entry) => entry.visibility)).toEqual([VISIBILITY_VISIBLE, VISIBILITY_OCCLUDED])
  })

  it('walks the whole z-order, cutting each window with everything above it', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: rect(0, 0, 500, 1000) }),
      windowSample({ hwnd: 2, bounds: rect(500, 0, 1000, 1000) }),
      windowSample({ hwnd: 3, bounds: rect(0, 0, 1000, 1000) }),
      windowSample({ hwnd: 4, bounds: rect(1200, 0, 1500, 500) }),
    ], [PRIMARY])
    expect(results.map((entry) => entry.visibility)).toEqual([
      VISIBILITY_VISIBLE,
      VISIBILITY_VISIBLE,
      VISIBILITY_OCCLUDED,
      VISIBILITY_VISIBLE,
    ])
  })

  it('keeps every original window field and the original order', () => {
    const results = computeWindowVisibility([windowSample({ hwnd: 7, title: 'editor' })], [PRIMARY])
    expect(results).toHaveLength(1)
    expect(results[0].hwnd).toBe(7)
    expect(results[0].title).toBe('editor')
    expect(results[0].bounds).toEqual(rect(100, 100, 600, 600))
  })

  it('does not let a transparent window occlude what is below it', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PRIMARY, transparent: true }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 1000, 1000) }),
    ], [PRIMARY])
    expect(results[0].visibility).toBe(VISIBILITY_VISIBLE)
    expect(results[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('does not let a tool window occlude what is below it', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PRIMARY, toolWindow: true }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 1000, 1000) }),
    ], [PRIMARY])
    expect(results[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('does not let a minimized window occlude what is below it', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PRIMARY, minimized: true }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 1000, 1000) }),
    ], [PRIMARY])
    expect(results[0].visibility).toBe(VISIBILITY_HIDDEN)
    expect(results[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('does not let a cloaked window occlude what is below it', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PRIMARY, cloaked: true }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 1000, 1000) }),
    ], [PRIMARY])
    expect(results[0].visibility).toBe(VISIBILITY_HIDDEN)
    expect(results[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('occludes a window only once the windows above it add up to cover it', () => {
    const partial = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: rect(0, 0, 500, 1000) }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 1000, 1000) }),
    ], [PRIMARY])
    expect(partial[1].visibility).toBe(VISIBILITY_VISIBLE)

    const together = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: rect(0, 0, 500, 1000) }),
      windowSample({ hwnd: 2, bounds: rect(500, 0, 1000, 1000) }),
      windowSample({ hwnd: 3, bounds: rect(0, 0, 1000, 1000) }),
    ], [PRIMARY])
    expect(together[2].visibility).toBe(VISIBILITY_OCCLUDED)
  })

  it('keeps a window spanning two monitors visible while only one side is covered', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PRIMARY }),
      windowSample({ hwnd: 2, bounds: rect(1500, 100, 2500, 600) }),
    ], BOTH_MONITORS)
    expect(results[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('occludes a window spanning two monitors once both sides are covered', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PRIMARY }),
      windowSample({ hwnd: 2, bounds: SECONDARY }),
      windowSample({ hwnd: 3, bounds: rect(1500, 100, 2500, 600) }),
    ], BOTH_MONITORS)
    expect(results[2].visibility).toBe(VISIBILITY_OCCLUDED)
  })

  it('reports a parked window as offscreen without disturbing the rest of the walk', () => {
    const results = computeWindowVisibility([
      windowSample({ hwnd: 1, bounds: PARKED }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 1000, 1000) }),
    ], BOTH_MONITORS)
    expect(results[0].visibility).toBe(VISIBILITY_OFFSCREEN)
    expect(results[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('falls back to the default tolerance when none is supplied', () => {
    const stack = [
      windowSample({ hwnd: 1, bounds: rect(0, 0, 500, 996) }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 500, 1000) }),
    ]
    expect(computeWindowVisibility(stack, [PRIMARY])[1].visibility).toBe(VISIBILITY_OCCLUDED)
    expect(computeWindowVisibility(stack, [PRIMARY], 1000)[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('falls back to the default tolerance for a non-finite tolerance', () => {
    const stack = [
      windowSample({ hwnd: 1, bounds: rect(0, 0, 500, 994) }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 500, 1000) }),
    ]
    expect(computeWindowVisibility(stack, [PRIMARY], Number.NaN)[1].visibility).toBe(VISIBILITY_VISIBLE)
    expect(computeWindowVisibility(stack, [PRIMARY], null)[1].visibility).toBe(VISIBILITY_VISIBLE)
    expect(computeWindowVisibility(stack, [PRIMARY], Number.POSITIVE_INFINITY)[1].visibility)
      .toBe(VISIBILITY_VISIBLE)
    expect(VISIBLE_AREA_TOLERANCE_PX).toBe(2500)
  })

  it('honours a tolerance of zero rather than treating it as absent', () => {
    const stack = [
      windowSample({ hwnd: 1, bounds: rect(0, 0, 500, 999) }),
      windowSample({ hwnd: 2, bounds: rect(0, 0, 500, 1000) }),
    ]
    expect(computeWindowVisibility(stack, [PRIMARY])[1].visibility).toBe(VISIBILITY_OCCLUDED)
    expect(computeWindowVisibility(stack, [PRIMARY], 0)[1].visibility).toBe(VISIBILITY_VISIBLE)
  })

  it('tolerates an empty or missing window list', () => {
    expect(computeWindowVisibility([], [PRIMARY])).toEqual([])
    expect(computeWindowVisibility(null, [PRIMARY])).toEqual([])
  })
})

describe('coversMonitor', () => {
  it('detects a window filling a monitor exactly', () => {
    expect(coversMonitor(PRIMARY, [PRIMARY])).toBe(true)
  })

  it('detects a window overhanging a monitor', () => {
    expect(coversMonitor(rect(-8, -8, 1928, 1088), BOTH_MONITORS)).toBe(true)
  })

  it('detects a window covering the second monitor only', () => {
    expect(coversMonitor(SECONDARY, BOTH_MONITORS)).toBe(true)
  })

  it('rejects a window one pixel short of the monitor', () => {
    expect(coversMonitor(rect(0, 0, 1920, 1079), [PRIMARY])).toBe(false)
    expect(coversMonitor(rect(1, 0, 1920, 1080), [PRIMARY])).toBe(false)
  })

  it('rejects a floating window', () => {
    expect(coversMonitor(rect(300, 200, 1400, 900), BOTH_MONITORS)).toBe(false)
  })

  it('skips empty monitors and reports false without any monitor', () => {
    expect(coversMonitor(PRIMARY, [rect(0, 0, 0, 0)])).toBe(false)
    expect(coversMonitor(PRIMARY, [])).toBe(false)
    expect(coversMonitor(PRIMARY, null)).toBe(false)
  })
})

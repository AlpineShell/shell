import { describe, it, expect } from 'vitest'
import displayShellPlan from './displayShellPlan.js'

const { planDisplayShells, planChangesShells, misplacedShells, planSnapBack } = displayShellPlan

const laptop = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, scaleFactor: 2 }
const left = { id: 2, bounds: { x: 1440, y: -434, width: 2560, height: 1440 }, scaleFactor: 1 }
const right = { id: 3, bounds: { x: 4000, y: -434, width: 2560, height: 1440 }, scaleFactor: 1 }

describe('planDisplayShells', () => {
  it('changes nothing when every display already has a shell in place', () => {
    const plan = planDisplayShells([laptop, left], [laptop, left])
    expect(plan).toEqual({ stale: [], missing: [], moved: [] })
    expect(planChangesShells(plan)).toBe(false)
  })

  it('creates a shell only for a display that has none', () => {
    expect(planDisplayShells([laptop], [laptop, left]).missing).toEqual([left])
  })

  it('does not create a second shell when a display is reported as added twice', () => {
    const plan = planDisplayShells([laptop, left], [laptop, left])
    expect(plan.missing).toEqual([])
  })

  it('removes the shell of a display that changed its id without a removal event', () => {
    const renumbered = { ...left, id: 7 }
    const plan = planDisplayShells([laptop, left], [laptop, renumbered])
    expect(plan.stale).toEqual([2])
    expect(plan.missing).toEqual([renumbered])
  })

  it('removes every shell whose display is gone', () => {
    expect(planDisplayShells([laptop, left, right], [laptop]).stale).toEqual([2, 3])
  })

  it('moves a shell whose display changed bounds', () => {
    const shifted = { ...right, bounds: { ...right.bounds, x: 4100 } }
    expect(planDisplayShells([laptop, right], [laptop, shifted]).moved).toEqual([shifted])
  })

  it('moves a shell whose display changed scale', () => {
    const rescaled = { ...laptop, scaleFactor: 1.5 }
    expect(planDisplayShells([laptop], [rescaled]).moved).toEqual([rescaled])
  })
})

describe('misplacedShells', () => {
  const placedOn = (display, overrides = {}) => ({
    displayId: display.id,
    display: display.bounds,
    topBar: display.bounds,
    raised: false,
    desktop: display.bounds,
    ...overrides,
  })

  it('leaves every shell alone while each sits on its own display', () => {
    expect(misplacedShells([placedOn(laptop), placedOn(left)])).toEqual([])
  })

  it('finds the laptop Ridge that Windows pushed onto the docked monitor', () => {
    const pushedAway = placedOn(laptop, { topBar: left.bounds })
    expect(misplacedShells([pushedAway, placedOn(left)])).toEqual([laptop.id])
  })

  it('finds a Ridge that kept the size of the display it came from', () => {
    const wrongSize = placedOn(left, { topBar: { ...left.bounds, width: 1440, height: 900 } })
    expect(misplacedShells([wrongSize])).toEqual([left.id])
  })

  it('finds a desktop window that is not on its display', () => {
    expect(misplacedShells([placedOn(left, { desktop: laptop.bounds })])).toEqual([left.id])
  })

  it('accepts a raised Ridge that is shorter than its display while a menu is open', () => {
    const raised = placedOn(left, { raised: true, topBar: { ...left.bounds, height: 400 } })
    expect(misplacedShells([raised])).toEqual([])
  })

  it('still finds a raised Ridge on the wrong display', () => {
    const raised = placedOn(laptop, { raised: true, topBar: { ...left.bounds, height: 400 } })
    expect(misplacedShells([raised])).toEqual([laptop.id])
  })

  it('accepts the rounding a fractional scale leaves in the bounds', () => {
    const rounded = placedOn(left, { topBar: { ...left.bounds, width: left.bounds.width - 1 } })
    expect(misplacedShells([rounded])).toEqual([])
  })

  it('skips a desktop window the shell window hosts and a Ridge that is gone', () => {
    expect(misplacedShells([placedOn(left, { desktop: null, topBar: null })])).toEqual([])
  })

  it('finds the Ridge Windows pushed down by the strip Alpine just reserved on a docked monitor', () => {
    const pushedDown = placedOn(left, { topBar: { ...left.bounds, y: left.bounds.y + 24 } })
    expect(misplacedShells([pushedDown])).toEqual([left.id])
  })
})

describe('planSnapBack', () => {
  it('puts a Ridge back every time something moves it', () => {
    let recent = []
    for (const now of [0, 100, 200]) {
      const plan = planSnapBack(recent, now)
      expect(plan.allowed).toBe(true)
      recent = plan.recent
    }
    expect(recent).toEqual([0, 100, 200])
  })

  it('stops fighting a window manager that keeps moving it, and leaves it to the settle passes', () => {
    let recent = []
    for (const now of [0, 10, 20, 30, 40]) recent = planSnapBack(recent, now).recent
    expect(planSnapBack(recent, 50)).toEqual({ allowed: false, recent })
  })

  it('snaps back again once the fight is over', () => {
    const recent = [0, 10, 20, 30, 40]
    expect(planSnapBack(recent, 2100)).toEqual({ allowed: true, recent: [2100] })
  })
})

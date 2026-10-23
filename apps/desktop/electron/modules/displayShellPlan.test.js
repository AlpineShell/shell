import { describe, it, expect } from 'vitest'
import displayShellPlan from './displayShellPlan.js'

const { planDisplayShells, planChangesShells } = displayShellPlan

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

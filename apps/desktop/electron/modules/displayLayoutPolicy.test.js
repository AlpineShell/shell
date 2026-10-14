import { describe, expect, it } from 'vitest'
import displayLayoutPolicy from './displayLayoutPolicy.js'

const { planLayoutStaging } = displayLayoutPolicy

const threeAcross = [
  { id: '\\\\.\\DISPLAY1', x: 0, y: 0, orientation: 0, primary: false },
  { id: '\\\\.\\DISPLAY2', x: 1920, y: 0, orientation: 0, primary: true },
  { id: '\\\\.\\DISPLAY3', x: 3840, y: 0, orientation: 0, primary: false },
]

describe('planLayoutStaging', () => {
  it('stages the new primary before every other display', () => {
    const plan = planLayoutStaging(threeAcross)
    expect(plan.map((entry) => entry.id)).toEqual(['\\\\.\\DISPLAY2', '\\\\.\\DISPLAY1', '\\\\.\\DISPLAY3'])
    expect(plan.map((entry) => entry.makePrimary)).toEqual([true, false, false])
  })

  it('moves the primary to the origin and keeps the others where they sit next to it', () => {
    const plan = planLayoutStaging(threeAcross)
    expect(plan.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 },
      { x: -1920, y: 0 },
      { x: 1920, y: 0 },
    ])
  })

  it('treats the first display as primary when none is marked', () => {
    const plan = planLayoutStaging(threeAcross.map((entry) => ({ ...entry, primary: false })))
    expect(plan[0]).toMatchObject({ id: '\\\\.\\DISPLAY1', x: 0, y: 0, makePrimary: true })
  })

  it('rounds positions dragged to fractional pixels', () => {
    const plan = planLayoutStaging([
      { id: 'a', x: 10.4, y: 0, orientation: 0, primary: true },
      { id: 'b', x: 1930.7, y: -5.6, orientation: 90, primary: false },
    ])
    expect(plan[1]).toMatchObject({ x: 1920, y: -6, orientation: 90 })
  })

  it('plans nothing for an empty or missing layout', () => {
    expect(planLayoutStaging([])).toEqual([])
    expect(planLayoutStaging(null)).toEqual([])
  })
})

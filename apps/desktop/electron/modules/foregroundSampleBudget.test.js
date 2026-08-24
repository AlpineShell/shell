import { describe, it, expect } from 'vitest'
import foregroundSampleBudget from './foregroundSampleBudget.js'

const { MIN_SAMPLE_INTERVAL_MS, createSampleBudget } = foregroundSampleBudget

const OLD_POLL_INTERVAL_MS = 300
const ATTACHED_DISPLAYS = 3

function countClaims(callIntervalMs, durationMs) {
  const budget = createSampleBudget()
  let claimed = 0
  for (let now = 0; now <= durationMs; now += callIntervalMs) {
    if (budget.claim(now)) claimed++
  }
  return claimed
}

function pollTicksIn(durationMs) {
  return durationMs / OLD_POLL_INTERVAL_MS + 1
}

describe('createSampleBudget', () => {
  it('allows the first sample immediately', () => {
    expect(createSampleBudget().claim(1000)).toBe(true)
  })

  it('refuses a second sample inside the minimum interval', () => {
    const budget = createSampleBudget()
    budget.claim(1000)
    expect(budget.claim(1000 + MIN_SAMPLE_INTERVAL_MS - 1)).toBe(false)
    expect(budget.claim(1000 + MIN_SAMPLE_INTERVAL_MS)).toBe(true)
  })

  it('keeps allowing samples indefinitely once the interval has elapsed', () => {
    const budget = createSampleBudget()
    for (let tick = 0; tick < 200; tick++) {
      expect(budget.claim(MIN_SAMPLE_INTERVAL_MS * tick)).toBe(true)
    }
  })

  it('never samples faster than the poll it replaces, however often it is called', () => {
    const durationMs = 60000
    expect(countClaims(1, durationMs)).toBeLessThanOrEqual(pollTicksIn(durationMs))
    expect(countClaims(16, durationMs)).toBeLessThanOrEqual(pollTicksIn(durationMs))
    expect(countClaims(OLD_POLL_INTERVAL_MS, durationMs)).toBeLessThanOrEqual(pollTicksIn(durationMs))
  })

  it('does not hand a newly focused window a free extra sample', () => {
    const budget = createSampleBudget()
    expect(budget.claim(0)).toBe(true)
    expect(budget.claim(10)).toBe(false)
    expect(budget.claim(20)).toBe(false)
  })

  it('holds the machine-wide bound when the foreground churns across every attached display', () => {
    const budget = createSampleBudget()
    const durationMs = 60000
    let claimed = 0
    for (let now = 0; now <= durationMs; now += 5) {
      for (let display = 0; display < ATTACHED_DISPLAYS; display++) {
        if (budget.claim(now)) claimed++
      }
    }
    expect(claimed).toBeLessThanOrEqual(pollTicksIn(durationMs))
  })

  it('does not scale the bound with the number of attached displays', () => {
    const durationMs = 60000
    const perDisplayBudgets = Array.from({ length: ATTACHED_DISPLAYS }, () => createSampleBudget())
    const shared = createSampleBudget()
    let perDisplayClaims = 0
    let sharedClaims = 0
    for (let now = 0; now <= durationMs; now += 5) {
      for (const budget of perDisplayBudgets) {
        if (budget.claim(now)) perDisplayClaims++
      }
      for (let display = 0; display < ATTACHED_DISPLAYS; display++) {
        if (shared.claim(now)) sharedClaims++
      }
    }
    expect(perDisplayClaims).toBeGreaterThan(pollTicksIn(durationMs))
    expect(sharedClaims).toBeLessThanOrEqual(pollTicksIn(durationMs))
  })
})

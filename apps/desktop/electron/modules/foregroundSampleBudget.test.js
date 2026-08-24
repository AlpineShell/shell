import { describe, it, expect } from 'vitest'
import foregroundSampleBudget from './foregroundSampleBudget.js'

const { MIN_SAMPLE_INTERVAL_MS, claimSample } = foregroundSampleBudget

const DISPLAY = 1
const OTHER_DISPLAY = 2
const OLD_POLL_INTERVAL_MS = 300

function countClaims(callIntervalMs, durationMs) {
  const budgets = new Map()
  let claimed = 0
  for (let now = 0; now <= durationMs; now += callIntervalMs) {
    if (claimSample(budgets, DISPLAY, now)) claimed++
  }
  return claimed
}

describe('claimSample', () => {
  it('allows the first sample of a display immediately', () => {
    const budgets = new Map()
    expect(claimSample(budgets, DISPLAY, 1000)).toBe(true)
  })

  it('refuses a second sample inside the minimum interval', () => {
    const budgets = new Map()
    claimSample(budgets, DISPLAY, 1000)
    expect(claimSample(budgets, DISPLAY, 1000 + MIN_SAMPLE_INTERVAL_MS - 1)).toBe(false)
    expect(claimSample(budgets, DISPLAY, 1000 + MIN_SAMPLE_INTERVAL_MS)).toBe(true)
  })

  it('keeps allowing samples indefinitely once the interval has elapsed', () => {
    const budgets = new Map()
    for (let tick = 0; tick < 200; tick++) {
      expect(claimSample(budgets, DISPLAY, MIN_SAMPLE_INTERVAL_MS * tick)).toBe(true)
    }
  })

  it('never samples faster than the poll it replaces, however often it is called', () => {
    const durationMs = 60000
    const oldPollSamples = durationMs / OLD_POLL_INTERVAL_MS + 1
    expect(countClaims(1, durationMs)).toBeLessThanOrEqual(oldPollSamples)
    expect(countClaims(16, durationMs)).toBeLessThanOrEqual(oldPollSamples)
    expect(countClaims(OLD_POLL_INTERVAL_MS, durationMs)).toBeLessThanOrEqual(oldPollSamples)
  })

  it('does not hand a newly focused window on the same display a free extra sample', () => {
    const budgets = new Map()
    expect(claimSample(budgets, DISPLAY, 0)).toBe(true)
    expect(claimSample(budgets, DISPLAY, 10)).toBe(false)
    expect(claimSample(budgets, DISPLAY, 20)).toBe(false)
  })

  it('tracks displays independently', () => {
    const budgets = new Map()
    expect(claimSample(budgets, DISPLAY, 0)).toBe(true)
    expect(claimSample(budgets, OTHER_DISPLAY, 0)).toBe(true)
    expect(claimSample(budgets, DISPLAY, 0)).toBe(false)
  })

  it('bounds the aggregate rate of a display under foreground churn', () => {
    const budgets = new Map()
    const durationMs = 10000
    let claimed = 0
    for (let now = 0; now <= durationMs; now += 5) {
      if (claimSample(budgets, DISPLAY, now)) claimed++
    }
    expect(claimed).toBeLessThanOrEqual(durationMs / MIN_SAMPLE_INTERVAL_MS + 1)
  })
})

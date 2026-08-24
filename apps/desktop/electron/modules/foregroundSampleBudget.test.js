import { describe, it, expect } from 'vitest'
import foregroundSampleBudget from './foregroundSampleBudget.js'

const {
  MIN_SAMPLE_INTERVAL_MS,
  SAMPLE_BURST_LIMIT,
  SAMPLE_BURST_COOLDOWN_MS,
  claimSample,
} = foregroundSampleBudget

const DISPLAY = 1
const HWND = 0x000a1234
const OTHER_HWND = 0x000b5678
const OLD_POLL_INTERVAL_MS = 300

function countClaims(callIntervalMs, durationMs) {
  const budgets = new Map()
  let claimed = 0
  for (let now = 0; now <= durationMs; now += callIntervalMs) {
    if (claimSample(budgets, DISPLAY, HWND, now)) claimed++
  }
  return claimed
}

describe('claimSample', () => {
  it('allows the first sample of a window immediately', () => {
    const budgets = new Map()
    expect(claimSample(budgets, DISPLAY, HWND, 1000)).toBe(true)
  })

  it('refuses a second sample inside the minimum interval', () => {
    const budgets = new Map()
    claimSample(budgets, DISPLAY, HWND, 1000)
    expect(claimSample(budgets, DISPLAY, HWND, 1000 + MIN_SAMPLE_INTERVAL_MS - 1)).toBe(false)
    expect(claimSample(budgets, DISPLAY, HWND, 1000 + MIN_SAMPLE_INTERVAL_MS)).toBe(true)
  })

  it('stops after the burst limit until the cooldown has elapsed', () => {
    const budgets = new Map()
    const lastClaimAt = MIN_SAMPLE_INTERVAL_MS * (SAMPLE_BURST_LIMIT - 1)
    for (let taken = 0; taken < SAMPLE_BURST_LIMIT; taken++) {
      expect(claimSample(budgets, DISPLAY, HWND, MIN_SAMPLE_INTERVAL_MS * taken)).toBe(true)
    }
    expect(claimSample(budgets, DISPLAY, HWND, lastClaimAt + SAMPLE_BURST_COOLDOWN_MS - 1)).toBe(false)
    expect(claimSample(budgets, DISPLAY, HWND, lastClaimAt + SAMPLE_BURST_COOLDOWN_MS)).toBe(true)
  })

  it('holds the sample rate below the old unbounded poll however often it is called', () => {
    const durationMs = 60000
    const oldPollSamples = durationMs / OLD_POLL_INTERVAL_MS
    expect(countClaims(1, durationMs)).toBeLessThan(oldPollSamples)
    expect(countClaims(16, durationMs)).toBeLessThan(oldPollSamples)
    expect(countClaims(OLD_POLL_INTERVAL_MS, durationMs)).toBeLessThan(oldPollSamples)
  })

  it('gives a newly focused window on the same display a fresh burst', () => {
    const budgets = new Map()
    for (let taken = 0; taken < SAMPLE_BURST_LIMIT; taken++) {
      claimSample(budgets, DISPLAY, HWND, MIN_SAMPLE_INTERVAL_MS * taken)
    }
    const exhaustedAt = MIN_SAMPLE_INTERVAL_MS * SAMPLE_BURST_LIMIT
    expect(claimSample(budgets, DISPLAY, HWND, exhaustedAt)).toBe(false)
    expect(claimSample(budgets, DISPLAY, OTHER_HWND, exhaustedAt)).toBe(true)
  })

  it('tracks displays independently', () => {
    const budgets = new Map()
    expect(claimSample(budgets, DISPLAY, HWND, 0)).toBe(true)
    expect(claimSample(budgets, DISPLAY + 1, HWND, 0)).toBe(true)
    expect(claimSample(budgets, DISPLAY, HWND, 0)).toBe(false)
  })
})

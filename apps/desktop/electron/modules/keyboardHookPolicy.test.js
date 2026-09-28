import { describe, it, expect } from 'vitest'
import keyboardHookPolicy from './keyboardHookPolicy.js'

const { HOOK_REFRESH_TICK_MS, HOOK_REFRESH_PERIOD_MS, HOOK_STALL_MS, hookRefreshDue } = keyboardHookPolicy

const START = 50_000

function tick(overrides) {
  return { hooked: true, now: START + HOOK_REFRESH_TICK_MS, lastTickAt: START, lastRefreshAt: START, ...overrides }
}

describe('hookRefreshDue', () => {
  it('leaves a healthy hook alone on an on-time tick', () => {
    expect(hookRefreshDue(tick())).toBe(false)
  })

  it('tolerates ordinary timer jitter', () => {
    expect(hookRefreshDue(tick({ now: START + HOOK_REFRESH_TICK_MS + HOOK_STALL_MS - 1 }))).toBe(false)
  })

  it('refreshes after the main thread stalled long enough for Windows to time the hook out', () => {
    expect(hookRefreshDue(tick({ now: START + HOOK_REFRESH_TICK_MS + HOOK_STALL_MS }))).toBe(true)
    expect(hookRefreshDue(tick({ now: START + 5000 }))).toBe(true)
  })

  it('refreshes on a fixed period even without a stall', () => {
    const now = START + HOOK_REFRESH_PERIOD_MS
    expect(hookRefreshDue(tick({ now, lastTickAt: now - HOOK_REFRESH_TICK_MS }))).toBe(true)
  })

  it('waits for the period when the last refresh was recent', () => {
    const now = START + HOOK_REFRESH_PERIOD_MS - 1
    expect(hookRefreshDue(tick({ now, lastTickAt: now - HOOK_REFRESH_TICK_MS }))).toBe(false)
  })

  it('keeps retrying on every tick while no hook is installed', () => {
    expect(hookRefreshDue(tick({ hooked: false }))).toBe(true)
  })
})

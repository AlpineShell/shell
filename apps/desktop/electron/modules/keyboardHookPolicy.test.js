import { describe, it, expect } from 'vitest'
import keyboardHookPolicy from './keyboardHookPolicy.js'

const { HOOK_REFRESH_TICK_MS, HOOK_STALL_MS, HOOK_RETRY_MS, hookRefreshDue } = keyboardHookPolicy

const START = 50_000
const SHORTEST_STALL_THAT_TIMES_OUT_A_KEY_MS = 300
const STALL_OFFSETS_MS = Array.from({ length: HOOK_REFRESH_TICK_MS / 5 }, (_, i) => i * 5)

function tick(overrides) {
  return { hooked: true, now: START + HOOK_REFRESH_TICK_MS, lastTickAt: START, lastRefreshAt: START, ...overrides }
}

function tickAfterStall(stallMs, stallStartsAfterLastTickMs) {
  const scheduledAt = START + HOOK_REFRESH_TICK_MS
  const stallEndsAt = START + stallStartsAfterLastTickMs + stallMs
  return tick({ now: Math.max(scheduledAt, stallEndsAt) })
}

describe('hookRefreshDue', () => {
  it('leaves a healthy hook alone on an on-time tick', () => {
    expect(hookRefreshDue(tick())).toBe(false)
  })

  it('tolerates ordinary timer jitter', () => {
    expect(hookRefreshDue(tick({ now: START + HOOK_REFRESH_TICK_MS + HOOK_STALL_MS - 1 }))).toBe(false)
  })

  it('never reinstalls a healthy hook just because time has passed', () => {
    const now = START + 10 * 60_000
    expect(hookRefreshDue(tick({ now, lastTickAt: now - HOOK_REFRESH_TICK_MS }))).toBe(false)
  })

  it('refreshes after every stall long enough to time a key out, wherever it starts in the tick', () => {
    for (const stallMs of [SHORTEST_STALL_THAT_TIMES_OUT_A_KEY_MS, 400, 800, 1250, 5000]) {
      for (const offsetMs of STALL_OFFSETS_MS) {
        expect(hookRefreshDue(tickAfterStall(stallMs, offsetMs)), `${stallMs} ms stall starting ${offsetMs} ms after a tick`).toBe(true)
      }
    }
  })

  it('leaves the hook alone after a hitch no longer than the stall threshold', () => {
    for (const stallMs of [50, 150, HOOK_STALL_MS]) {
      for (const offsetMs of STALL_OFFSETS_MS) {
        expect(hookRefreshDue(tickAfterStall(stallMs, offsetMs)), `${stallMs} ms stall starting ${offsetMs} ms after a tick`).toBe(false)
      }
    }
  })

  it('retries a failed install once a second, not on every tick', () => {
    expect(hookRefreshDue(tick({ hooked: false }))).toBe(false)
    expect(hookRefreshDue(tick({ hooked: false, now: START + HOOK_RETRY_MS - 1 }))).toBe(false)
    expect(hookRefreshDue(tick({ hooked: false, now: START + HOOK_RETRY_MS }))).toBe(true)
  })
})

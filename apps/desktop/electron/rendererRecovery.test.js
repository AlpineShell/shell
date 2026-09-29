import { describe, expect, it } from 'vitest'

const {
  RELOAD_WINDOW_MS,
  MAX_RELOADS_PER_WINDOW,
  MAX_RELOAD_DELAY_MS,
  planRendererReload,
} = await import('./rendererRecovery.js')

function crashRepeatedly(times, { start = 1000, spacingMs = 100 } = {}) {
  let recentCrashes = []
  const plans = []
  for (let index = 0; index < times; index++) {
    const plan = planRendererReload({ recentCrashes, now: start + index * spacingMs })
    recentCrashes = plan.crashes
    plans.push(plan)
  }
  return plans
}

describe('planRendererReload', () => {
  it('reloads a crashed window after a short pause', () => {
    expect(planRendererReload({ recentCrashes: [], now: 5000 })).toEqual({ reload: true, delayMs: 600, crashes: [5000] })
  })

  it('waits twice as long after each crash in a row', () => {
    expect(crashRepeatedly(4).map((plan) => plan.delayMs)).toEqual([600, 1200, 2400, 4800])
  })

  it('never waits longer than the cap', () => {
    const plans = crashRepeatedly(MAX_RELOADS_PER_WINDOW)
    expect(Math.max(...plans.map((plan) => plan.delayMs))).toBeLessThanOrEqual(MAX_RELOAD_DELAY_MS)
  })

  it('stops reloading a window that crashes again and again within a minute', () => {
    const plans = crashRepeatedly(MAX_RELOADS_PER_WINDOW + 1)
    expect(plans.slice(0, MAX_RELOADS_PER_WINDOW).every((plan) => plan.reload)).toBe(true)
    expect(plans[MAX_RELOADS_PER_WINDOW]).toMatchObject({ reload: false, delayMs: 0 })
  })

  it('forgets crashes older than a minute', () => {
    const recentCrashes = [1000, 1100, 1200, 1300, 1400]
    const plan = planRendererReload({ recentCrashes, now: 1400 + RELOAD_WINDOW_MS + 1 })
    expect(plan).toMatchObject({ reload: true, delayMs: 600 })
    expect(plan.crashes).toHaveLength(1)
  })
})

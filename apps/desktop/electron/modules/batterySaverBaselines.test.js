import { describe, it, expect } from 'vitest'
import batterySaverBaselines from './batterySaverBaselines.js'
import monitorIdentity from './monitorIdentity.js'

const { createBatterySaverBaselines } = batterySaverBaselines
const { BUILTIN_MONITOR_KEY, LEGACY_BUILTIN_MONITOR_ID } = monitorIdentity

const READBACK_TOLERANCE_PERCENT = 2
const DELL_KEY = 'panel:DEL-4278-52KH2P3'

function dimmed(ledger, stableKey, currentBrightness, dimmedTo, accepted) {
  const { isFirstAttempt } = ledger.beginDimAttempt(stableKey, currentBrightness)
  return ledger.finishDimAttempt(stableKey, { isFirstAttempt, dimmedTo, accepted })
}

describe('createBatterySaverBaselines', () => {
  it('captures the pre-dim brightness on the first accepted attempt', () => {
    const ledger = createBatterySaverBaselines()
    expect(dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)).toBe(true)
    expect(ledger.baselineFor(BUILTIN_MONITOR_KEY)).toBe(100)
    expect(ledger.appliedFor(BUILTIN_MONITOR_KEY)).toBe(70)
  })

  it('leaves no baseline behind when the very first write is rejected', () => {
    const ledger = createBatterySaverBaselines()
    expect(dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, false)).toBe(false)
    expect(ledger.holds(BUILTIN_MONITOR_KEY)).toBe(false)
    expect(ledger.size()).toBe(0)
  })

  it('keeps an already captured baseline when a later dim write is rejected', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(dimmed(ledger, BUILTIN_MONITOR_KEY, 70, 50, false)).toBe(false)
    expect(ledger.baselineFor(BUILTIN_MONITOR_KEY)).toBe(100)
  })

  it('keeps the baseline when the restore write is rejected, so the display can still be put back', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(ledger.finishRestoreAttempt(BUILTIN_MONITOR_KEY, false)).toBe(false)
    expect(ledger.baselineFor(BUILTIN_MONITOR_KEY)).toBe(100)
    expect(ledger.appliedFor(BUILTIN_MONITOR_KEY)).toBe(70)
  })

  it('drops the baseline once the restore write is accepted', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(ledger.finishRestoreAttempt(BUILTIN_MONITOR_KEY, true)).toBe(true)
    expect(ledger.holds(BUILTIN_MONITOR_KEY)).toBe(false)
    expect(ledger.appliedFor(BUILTIN_MONITOR_KEY)).toBeUndefined()
  })

  it('forgets a baseline only when it holds one', () => {
    const ledger = createBatterySaverBaselines()
    expect(ledger.forget(BUILTIN_MONITOR_KEY)).toBe(false)
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(ledger.forget(BUILTIN_MONITOR_KEY)).toBe(true)
    expect(ledger.size()).toBe(0)
  })
})

describe('isUnexpectedBrightness', () => {
  it('accepts a readback that matches what battery saver applied', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(ledger.isUnexpectedBrightness(BUILTIN_MONITOR_KEY, 71, READBACK_TOLERANCE_PERCENT)).toBe(false)
  })

  it('accepts a readback that matches the captured baseline', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(ledger.isUnexpectedBrightness(BUILTIN_MONITOR_KEY, 100, READBACK_TOLERANCE_PERCENT)).toBe(false)
  })

  it('reports a readback that matches neither', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(ledger.isUnexpectedBrightness(BUILTIN_MONITOR_KEY, 40, READBACK_TOLERANCE_PERCENT)).toBe(true)
  })

  it('says nothing about a display it holds no baseline for', () => {
    const ledger = createBatterySaverBaselines()
    expect(ledger.isUnexpectedBrightness(DELL_KEY, 40, READBACK_TOLERANCE_PERCENT)).toBe(false)
  })
})

describe('loadStored', () => {
  it('discards a baseline keyed by a GDI display name rather than applying it', () => {
    const ledger = createBatterySaverBaselines()
    expect(ledger.loadStored({ '\\\\.\\DISPLAY3': 100 })).toEqual(['\\\\.\\DISPLAY3'])
    expect(ledger.size()).toBe(0)
  })

  it('adopts the old built-in display baseline under the stable key', () => {
    const ledger = createBatterySaverBaselines()
    expect(ledger.loadStored({ [LEGACY_BUILTIN_MONITOR_ID]: 90 })).toEqual([])
    expect(ledger.baselineFor(BUILTIN_MONITOR_KEY)).toBe(90)
  })

  it('clamps a stored baseline into the percentage range', () => {
    const ledger = createBatterySaverBaselines()
    ledger.loadStored({ [DELL_KEY]: 240 })
    expect(ledger.baselineFor(DELL_KEY)).toBe(100)
  })
})

describe('holdsKeyOtherThan', () => {
  it('is false while only the built-in display holds a baseline', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, BUILTIN_MONITOR_KEY, 100, 70, true)
    expect(ledger.holdsKeyOtherThan(BUILTIN_MONITOR_KEY)).toBe(false)
  })

  it('is true once an external display holds one', () => {
    const ledger = createBatterySaverBaselines()
    dimmed(ledger, DELL_KEY, 100, 70, true)
    expect(ledger.holdsKeyOtherThan(BUILTIN_MONITOR_KEY)).toBe(true)
  })
})

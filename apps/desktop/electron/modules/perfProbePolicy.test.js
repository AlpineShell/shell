import { describe, it, expect } from 'vitest'
import perfProbePolicy from './perfProbePolicy.js'

const {
  DEFAULT_WINDOW_MS,
  MAX_SAMPLES_PER_SERIES,
  SWITCH_ACK_TIMEOUT_MS,
  percentile,
  withinWindow,
  appendSample,
  summarizeSwitchLatency,
  summarizeHardFaults,
  summarizeMemory,
  summarizeDwmFrames,
  summarizePerfProbe,
} = perfProbePolicy

const NOW = 1_700_000_000_000
const ONE_MINUTE_MS = 60 * 1000
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS

const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const ONE_TO_TEN_SHUFFLED = [7, 2, 10, 4, 1, 9, 3, 6, 8, 5]

const EMPTY_SWITCH_SUMMARY = { count: 0, timedOutCount: 0, p50Ms: null, p95Ms: null, minMs: null, maxMs: null }
const EMPTY_HARD_FAULT_SUMMARY = { count: 0, p50PerSecond: null, p95PerSecond: null, maxPerSecond: null, meanPerSecond: null }
const EMPTY_MEMORY_SUMMARY = {
  count: 0,
  totalBytes: null,
  availableBytes: null,
  standbyBytes: null,
  minAvailableBytes: null,
  minStandbyBytes: null,
}
const UNSUPPORTED_DWM_SUMMARY = { supported: false, refreshRateHz: null, framesLate: null, framesDropped: null }

function switchSample(overrides) {
  return { at: NOW, latencyMs: 120, timedOut: false, ...overrides }
}

function hungSwitchSample(overrides) {
  return switchSample({ latencyMs: SWITCH_ACK_TIMEOUT_MS, timedOut: true, ...overrides })
}

function pageReadSample(overrides) {
  return { at: NOW, pageReadsPerSecond: 2, ...overrides }
}

function memorySample(overrides) {
  return { at: NOW, totalBytes: 16e9, availableBytes: 6e9, standbyBytes: 4e9, ...overrides }
}

function dwmSample(overrides) {
  return { at: NOW, supported: true, refreshRateHz: 60, framesLate: 100, framesDropped: 10, ...overrides }
}

function seriesStampedOneMsApart(count) {
  const series = []
  for (let position = 0; position < count; position += 1) {
    series.push({ at: NOW - (count - 1 - position), position })
  }
  return series
}

describe('percentile', () => {
  it('takes the nearest rank of the series', () => {
    expect(percentile(ONE_TO_TEN, 0.5)).toBe(5)
    expect(percentile(ONE_TO_TEN, 0.95)).toBe(10)
  })

  it('holds the edges inside the series', () => {
    expect(percentile(ONE_TO_TEN, 0)).toBe(1)
    expect(percentile(ONE_TO_TEN, 0.01)).toBe(1)
    expect(percentile(ONE_TO_TEN, 1)).toBe(10)
    expect(percentile(ONE_TO_TEN, 2)).toBe(10)
  })

  it('does not need the values handed to it in order', () => {
    expect(percentile(ONE_TO_TEN_SHUFFLED, 0.5)).toBe(5)
    expect(percentile(ONE_TO_TEN_SHUFFLED, 0.95)).toBe(10)
  })

  it('leaves the caller series untouched', () => {
    const caller = [3, 1, 2]
    percentile(caller, 0.5)
    expect(caller).toEqual([3, 1, 2])
  })

  it('ignores entries that are not finite numbers', () => {
    const noisy = [3, NaN, undefined, null, 'seven', Infinity, 1, 2]
    expect(percentile(noisy, 0.5)).toBe(2)
    expect(percentile(noisy, 1)).toBe(3)
  })

  it('reports nothing for a series with no readable values', () => {
    expect(percentile([], 0.5)).toBe(null)
    expect(percentile(undefined, 0.5)).toBe(null)
    expect(percentile([NaN, null, 'nonsense'], 0.95)).toBe(null)
  })

  it('reports the single value at every rank', () => {
    expect(percentile([42], 0.5)).toBe(42)
    expect(percentile([42], 0.95)).toBe(42)
    expect(percentile([42], 0)).toBe(42)
    expect(percentile([42], 1)).toBe(42)
  })
})

describe('withinWindow', () => {
  it('drops samples older than the window', () => {
    const kept = withinWindow([switchSample({ at: NOW - TEN_MINUTES_MS }), switchSample({ at: NOW - 1000 })], NOW, ONE_MINUTE_MS)
    expect(kept.map(sample => sample.at)).toEqual([NOW - 1000])
  })

  it('keeps a sample stamped exactly on the boundary', () => {
    const kept = withinWindow([switchSample({ at: NOW - ONE_MINUTE_MS }), switchSample({ at: NOW - ONE_MINUTE_MS - 1 })], NOW, ONE_MINUTE_MS)
    expect(kept.map(sample => sample.at)).toEqual([NOW - ONE_MINUTE_MS])
  })

  it('keeps a sample stamped right now', () => {
    expect(withinWindow([switchSample({ at: NOW })], NOW, ONE_MINUTE_MS)).toHaveLength(1)
  })

  it('drops samples stamped in the future', () => {
    const kept = withinWindow([switchSample({ at: NOW + 1 }), switchSample({ at: NOW + TEN_MINUTES_MS })], NOW, ONE_MINUTE_MS)
    expect(kept).toEqual([])
  })

  it('drops entries without a readable timestamp', () => {
    const kept = withinWindow(
      [switchSample({ at: NaN }), switchSample({ at: undefined }), switchSample({ at: '1700000000000' }), null, switchSample({ at: NOW })],
      NOW,
      ONE_MINUTE_MS
    )
    expect(kept.map(sample => sample.at)).toEqual([NOW])
  })

  it('keeps only the newest samples once the series overflows', () => {
    const overflowing = seriesStampedOneMsApart(MAX_SAMPLES_PER_SERIES + 10)
    const kept = withinWindow(overflowing, NOW, ONE_MINUTE_MS)
    expect(kept).toHaveLength(MAX_SAMPLES_PER_SERIES)
    expect(kept[0].position).toBe(10)
    expect(kept[kept.length - 1]).toEqual({ at: NOW, position: MAX_SAMPLES_PER_SERIES + 9 })
  })

  it('reads a missing series without throwing', () => {
    expect(withinWindow(undefined, NOW, ONE_MINUTE_MS)).toEqual([])
    expect(withinWindow([], NOW, ONE_MINUTE_MS)).toEqual([])
  })
})

describe('appendSample', () => {
  it('adds the sample and trims the window in one step', () => {
    const stale = switchSample({ at: NOW - TEN_MINUTES_MS })
    const recent = switchSample({ at: NOW - 1000 })
    const fresh = switchSample({ at: NOW })
    expect(appendSample([stale, recent], fresh, NOW, ONE_MINUTE_MS)).toEqual([recent, fresh])
  })

  it('starts a series from nothing', () => {
    const fresh = switchSample({ at: NOW })
    expect(appendSample(undefined, fresh, NOW, ONE_MINUTE_MS)).toEqual([fresh])
  })

  it('drops a sample that is already outside the window', () => {
    expect(appendSample([], switchSample({ at: NOW - TEN_MINUTES_MS }), NOW, ONE_MINUTE_MS)).toEqual([])
  })
})

describe('summarizeSwitchLatency', () => {
  it('reports nothing for an empty window', () => {
    expect(summarizeSwitchLatency([])).toEqual(EMPTY_SWITCH_SUMMARY)
    expect(summarizeSwitchLatency(undefined)).toEqual(EMPTY_SWITCH_SUMMARY)
  })

  it('reports the single sample as every percentile and both extremes', () => {
    expect(summarizeSwitchLatency([switchSample({ latencyMs: 73 })])).toEqual({
      count: 1,
      timedOutCount: 0,
      p50Ms: 73,
      p95Ms: 73,
      minMs: 73,
      maxMs: 73,
    })
  })

  it('summarizes a window of readable switches', () => {
    const samples = ONE_TO_TEN.map(latencyMs => switchSample({ latencyMs: latencyMs * 10 }))
    expect(summarizeSwitchLatency(samples)).toEqual({
      count: 10,
      timedOutCount: 0,
      p50Ms: 50,
      p95Ms: 100,
      minMs: 10,
      maxMs: 100,
    })
  })

  it('counts hangs separately while still letting them set the p95', () => {
    const samples = [switchSample({ latencyMs: 50 }), switchSample({ latencyMs: 80 }), hungSwitchSample()]
    expect(summarizeSwitchLatency(samples)).toEqual({
      count: 3,
      timedOutCount: 1,
      p50Ms: 80,
      p95Ms: SWITCH_ACK_TIMEOUT_MS,
      minMs: 50,
      maxMs: SWITCH_ACK_TIMEOUT_MS,
    })
  })

  it('counts a hang that never produced a latency without letting it into the percentiles', () => {
    const samples = [switchSample({ latencyMs: 50 }), hungSwitchSample({ latencyMs: null })]
    expect(summarizeSwitchLatency(samples)).toEqual({
      count: 1,
      timedOutCount: 1,
      p50Ms: 50,
      p95Ms: 50,
      minMs: 50,
      maxMs: 50,
    })
  })
})

describe('summarizeHardFaults', () => {
  it('reports nothing for an empty window', () => {
    expect(summarizeHardFaults([])).toEqual(EMPTY_HARD_FAULT_SUMMARY)
    expect(summarizeHardFaults(undefined)).toEqual(EMPTY_HARD_FAULT_SUMMARY)
  })

  it('reports the single sample as every percentile and the worst second', () => {
    expect(summarizeHardFaults([pageReadSample({ pageReadsPerSecond: 12 })])).toEqual({
      count: 1,
      p50PerSecond: 12,
      p95PerSecond: 12,
      maxPerSecond: 12,
      meanPerSecond: 12,
    })
  })

  it('averages the window to hundredths and reports the worst second', () => {
    const samples = [1, 2, 4].map(pageReadsPerSecond => pageReadSample({ pageReadsPerSecond }))
    expect(summarizeHardFaults(samples)).toEqual({
      count: 3,
      p50PerSecond: 2,
      p95PerSecond: 4,
      maxPerSecond: 4,
      meanPerSecond: 2.33,
    })
  })

  it('rounds a mean that floating point cannot express exactly', () => {
    const samples = [0.1, 0.2].map(pageReadsPerSecond => pageReadSample({ pageReadsPerSecond }))
    expect(summarizeHardFaults(samples).meanPerSecond).toBe(0.15)
  })

  it('ignores samples whose counter was unreadable', () => {
    const samples = [pageReadSample({ pageReadsPerSecond: 6 }), pageReadSample({ pageReadsPerSecond: null }), pageReadSample({ pageReadsPerSecond: 2 })]
    expect(summarizeHardFaults(samples)).toEqual({
      count: 2,
      p50PerSecond: 2,
      p95PerSecond: 6,
      maxPerSecond: 6,
      meanPerSecond: 4,
    })
  })
})

describe('summarizeMemory', () => {
  it('reports nothing for an empty window', () => {
    expect(summarizeMemory([])).toEqual(EMPTY_MEMORY_SUMMARY)
    expect(summarizeMemory(undefined)).toEqual(EMPTY_MEMORY_SUMMARY)
  })

  it('reports the single sample as both the latest and the lowest reading', () => {
    expect(summarizeMemory([memorySample()])).toEqual({
      count: 1,
      totalBytes: 16e9,
      availableBytes: 6e9,
      standbyBytes: 4e9,
      minAvailableBytes: 6e9,
      minStandbyBytes: 4e9,
    })
  })

  it('reports the latest reading rather than the highest or the first', () => {
    const samples = [
      memorySample({ availableBytes: 6e9, standbyBytes: 4e9 }),
      memorySample({ availableBytes: 9e9, standbyBytes: 6e9 }),
      memorySample({ availableBytes: 2e9, standbyBytes: 1e9 }),
      memorySample({ availableBytes: 5e9, standbyBytes: 3e9 }),
    ]
    expect(summarizeMemory(samples)).toEqual({
      count: 4,
      totalBytes: 16e9,
      availableBytes: 5e9,
      standbyBytes: 3e9,
      minAvailableBytes: 2e9,
      minStandbyBytes: 1e9,
    })
  })

  it('falls back to the most recent sample that carried the field', () => {
    const samples = [
      memorySample({ availableBytes: 6e9, standbyBytes: 4e9 }),
      memorySample({ availableBytes: 2e9, standbyBytes: 1e9 }),
      memorySample({ availableBytes: undefined, standbyBytes: 3e9, totalBytes: null }),
    ]
    expect(summarizeMemory(samples)).toEqual({
      count: 3,
      totalBytes: 16e9,
      availableBytes: 2e9,
      standbyBytes: 3e9,
      minAvailableBytes: 2e9,
      minStandbyBytes: 1e9,
    })
  })
})

describe('summarizeDwmFrames', () => {
  it('reports nothing for an empty window', () => {
    expect(summarizeDwmFrames([])).toEqual(UNSUPPORTED_DWM_SUMMARY)
    expect(summarizeDwmFrames(undefined)).toEqual(UNSUPPORTED_DWM_SUMMARY)
  })

  it('reports no frames for a single sample, which is its own baseline', () => {
    expect(summarizeDwmFrames([dwmSample()])).toEqual({ supported: true, refreshRateHz: 60, framesLate: 0, framesDropped: 0 })
  })

  it('counts the frames between the first and the last readable sample', () => {
    const samples = [
      dwmSample({ framesLate: 100, framesDropped: 10 }),
      dwmSample({ framesLate: 140, framesDropped: 11 }),
      dwmSample({ framesLate: 175, framesDropped: 13, refreshRateHz: 120 }),
    ]
    expect(summarizeDwmFrames(samples)).toEqual({ supported: true, refreshRateHz: 120, framesLate: 75, framesDropped: 3 })
  })

  it('treats a counter reset as no frames rather than a negative count', () => {
    const samples = [dwmSample({ framesLate: 900, framesDropped: 80 }), dwmSample({ framesLate: 12, framesDropped: 1 })]
    expect(summarizeDwmFrames(samples)).toEqual({ supported: true, refreshRateHz: 60, framesLate: 0, framesDropped: 0 })
  })

  it('reports the composer as unsupported when no sample could read it', () => {
    const samples = [dwmSample({ supported: false }), dwmSample({ supported: false, framesLate: 500, framesDropped: 40 })]
    expect(summarizeDwmFrames(samples)).toEqual(UNSUPPORTED_DWM_SUMMARY)
  })

  it('skips samples whose counters are unreadable', () => {
    const samples = [
      dwmSample({ framesLate: null }),
      dwmSample({ framesLate: 100, framesDropped: 10 }),
      dwmSample({ framesLate: 160, framesDropped: 14, refreshRateHz: 120 }),
      dwmSample({ framesLate: NaN, framesDropped: 99, refreshRateHz: 240 }),
    ]
    expect(summarizeDwmFrames(samples)).toEqual({ supported: true, refreshRateHz: 120, framesLate: 60, framesDropped: 4 })
  })

  it('reports no refresh rate when the composer did not hand one back', () => {
    const samples = [dwmSample({ framesLate: 100 }), dwmSample({ framesLate: 120, refreshRateHz: null })]
    expect(summarizeDwmFrames(samples).refreshRateHz).toBe(null)
  })
})

describe('summarizePerfProbe', () => {
  it('echoes the sampling time', () => {
    expect(summarizePerfProbe({ nowMs: NOW }).sampledAt).toBe(NOW)
  })

  it('reports nothing for a window with no samples at all', () => {
    const probe = summarizePerfProbe({ nowMs: NOW, windowMs: ONE_MINUTE_MS, switches: [], pageReads: [], memory: [], dwmFrames: [] })
    expect(probe).toEqual({
      sampledAt: NOW,
      windowMs: ONE_MINUTE_MS,
      foregroundSwitch: EMPTY_SWITCH_SUMMARY,
      hardFaults: EMPTY_HARD_FAULT_SUMMARY,
      memory: EMPTY_MEMORY_SUMMARY,
      dwmFrames: UNSUPPORTED_DWM_SUMMARY,
    })
  })

  it('reports nothing when the series are missing entirely', () => {
    expect(summarizePerfProbe({ nowMs: NOW })).toEqual({
      sampledAt: NOW,
      windowMs: DEFAULT_WINDOW_MS,
      foregroundSwitch: EMPTY_SWITCH_SUMMARY,
      hardFaults: EMPTY_HARD_FAULT_SUMMARY,
      memory: EMPTY_MEMORY_SUMMARY,
      dwmFrames: UNSUPPORTED_DWM_SUMMARY,
    })
  })

  it('applies the window to every series', () => {
    const probe = summarizePerfProbe({
      nowMs: NOW,
      windowMs: ONE_MINUTE_MS,
      switches: [switchSample({ at: NOW - TEN_MINUTES_MS, latencyMs: 9000, timedOut: true }), switchSample({ at: NOW - 1000, latencyMs: 40 })],
      pageReads: [pageReadSample({ at: NOW - TEN_MINUTES_MS, pageReadsPerSecond: 900 }), pageReadSample({ at: NOW - 1000, pageReadsPerSecond: 3 })],
      memory: [
        memorySample({ at: NOW - TEN_MINUTES_MS, availableBytes: 1e9, standbyBytes: 1e8 }),
        memorySample({ at: NOW - 1000, availableBytes: 7e9, standbyBytes: 5e9 }),
      ],
      dwmFrames: [
        dwmSample({ at: NOW - TEN_MINUTES_MS, framesLate: 0, framesDropped: 0 }),
        dwmSample({ at: NOW - 2000, framesLate: 100, framesDropped: 10 }),
        dwmSample({ at: NOW - 1000, framesLate: 130, framesDropped: 12 }),
      ],
    })
    expect(probe.windowMs).toBe(ONE_MINUTE_MS)
    expect(probe.foregroundSwitch).toEqual({ count: 1, timedOutCount: 0, p50Ms: 40, p95Ms: 40, minMs: 40, maxMs: 40 })
    expect(probe.hardFaults).toEqual({ count: 1, p50PerSecond: 3, p95PerSecond: 3, maxPerSecond: 3, meanPerSecond: 3 })
    expect(probe.memory).toEqual({
      count: 1,
      totalBytes: 16e9,
      availableBytes: 7e9,
      standbyBytes: 5e9,
      minAvailableBytes: 7e9,
      minStandbyBytes: 5e9,
    })
    expect(probe.dwmFrames).toEqual({ supported: true, refreshRateHz: 60, framesLate: 30, framesDropped: 2 })
  })

  it('falls back to the default window when none is given', () => {
    const probe = summarizePerfProbe({
      nowMs: NOW,
      switches: [switchSample({ at: NOW - DEFAULT_WINDOW_MS - 1, latencyMs: 9000 }), switchSample({ at: NOW - DEFAULT_WINDOW_MS, latencyMs: 20 })],
    })
    expect(probe.windowMs).toBe(DEFAULT_WINDOW_MS)
    expect(probe.foregroundSwitch).toEqual({ count: 1, timedOutCount: 0, p50Ms: 20, p95Ms: 20, minMs: 20, maxMs: 20 })
  })

  it('falls back to the default window when the given one is not a positive number', () => {
    expect(summarizePerfProbe({ nowMs: NOW, windowMs: 0 }).windowMs).toBe(DEFAULT_WINDOW_MS)
    expect(summarizePerfProbe({ nowMs: NOW, windowMs: -1 }).windowMs).toBe(DEFAULT_WINDOW_MS)
    expect(summarizePerfProbe({ nowMs: NOW, windowMs: NaN }).windowMs).toBe(DEFAULT_WINDOW_MS)
    expect(summarizePerfProbe({ nowMs: NOW, windowMs: 'five minutes' }).windowMs).toBe(DEFAULT_WINDOW_MS)
  })
})

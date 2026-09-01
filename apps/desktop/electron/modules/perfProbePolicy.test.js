import { describe, it, expect } from 'vitest'
import perfProbePolicy from './perfProbePolicy.js'

const {
  SWITCH_RECORD,
  COUNTER_RECORD,
  FRAME_RECORD,
  LOAD_RECORD,
  MINIMUM_USEFUL_DURATION_MS,
  percentile,
  mean,
  round,
  isMeasurableSwitch,
  summarizeSwitchLatencies,
  summarizeSeries,
  cumulativeDelta,
  summarizeFrames,
  summarizeLoad,
  sessionWindow,
  summarizeSession,
  compareSessions,
  isReportableSession,
  sanitizeLabel,
  labelFromCommandLine,
  DEFAULT_LABEL,
  WARMUP_MS,
  withoutWarmup,
} = perfProbePolicy

const SETTLED_AT = 60 * 1000

function settledSession(records) {
  return [{ kind: LOAD_RECORD, at: 0, cpuPercent: null, windowCount: null, processCount: null }, ...records]
}

function switchSample(overrides) {
  return {
    kind: SWITCH_RECORD,
    at: SETTLED_AT,
    hwnd: 42,
    pid: 100,
    process: 'code',
    latencyMs: 5,
    hung: false,
    timedOut: false,
    shellOwned: false,
    ...overrides,
  }
}

function counterSample(overrides) {
  return {
    kind: COUNTER_RECORD,
    at: SETTLED_AT,
    values: {
      pageReadsPerSec: 0,
      pagesInputPerSec: 0,
      availableMBytes: 40000,
      standbyBytes: 8000000000,
      committedPercent: 30,
      ...(overrides?.values ?? {}),
    },
    ...overrides,
  }
}

describe('percentile', () => {
  it('returns null for an empty series', () => {
    expect(percentile([], 50)).toBe(null)
    expect(percentile(null, 50)).toBe(null)
  })

  it('picks the nearest rank without mutating the input', () => {
    const values = [10, 1, 5, 3, 8]
    expect(percentile(values, 50)).toBe(5)
    expect(values).toEqual([10, 1, 5, 3, 8])
  })

  it('clamps ranks outside 0 to 100', () => {
    expect(percentile([1, 2, 3], -10)).toBe(1)
    expect(percentile([1, 2, 3], 100)).toBe(3)
    expect(percentile([1, 2, 3], 250)).toBe(3)
  })

  it('resolves a single-sample series to that sample', () => {
    expect(percentile([7], 95)).toBe(7)
  })
})

describe('mean and round', () => {
  it('averages a series', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
  })

  it('returns null for an empty series', () => {
    expect(mean([])).toBe(null)
  })

  it('rounds to the requested decimals', () => {
    expect(round(1.23456, 2)).toBe(1.23)
    expect(round(1.23456, 0)).toBe(1)
  })

  it('rejects non-finite values', () => {
    expect(round(Number.NaN, 2)).toBe(null)
    expect(round(Number.POSITIVE_INFINITY, 2)).toBe(null)
    expect(round(undefined, 2)).toBe(null)
  })
})

describe('isMeasurableSwitch', () => {
  it('accepts a normal foreign-window switch', () => {
    expect(isMeasurableSwitch(switchSample())).toBe(true)
  })

  it('rejects switches into the shell itself', () => {
    expect(isMeasurableSwitch(switchSample({ shellOwned: true }))).toBe(false)
  })

  it('rejects records of another kind', () => {
    expect(isMeasurableSwitch(counterSample())).toBe(false)
  })

  it('rejects a negative or non-numeric latency', () => {
    expect(isMeasurableSwitch(switchSample({ latencyMs: -1 }))).toBe(false)
    expect(isMeasurableSwitch(switchSample({ latencyMs: null }))).toBe(false)
    expect(isMeasurableSwitch(switchSample({ latencyMs: Number.NaN }))).toBe(false)
  })

  it('keeps a timed-out sample, since a slow answer is the signal', () => {
    expect(isMeasurableSwitch(switchSample({ latencyMs: 1000, timedOut: true }))).toBe(true)
  })
})

describe('summarizeSwitchLatencies', () => {
  it('reports zeroed counts for an empty set', () => {
    const summary = summarizeSwitchLatencies([])
    expect(summary.count).toBe(0)
    expect(summary.p50).toBe(null)
    expect(summary.meanMs).toBe(null)
  })

  it('excludes shell-owned samples from every statistic', () => {
    const summary = summarizeSwitchLatencies([
      switchSample({ latencyMs: 1 }),
      switchSample({ latencyMs: 3 }),
      switchSample({ latencyMs: 9999, shellOwned: true }),
    ])
    expect(summary.count).toBe(2)
    expect(summary.maxMs).toBe(3)
  })

  it('counts hung and timed-out samples separately', () => {
    const summary = summarizeSwitchLatencies([
      switchSample({ hung: true }),
      switchSample({ timedOut: true }),
      switchSample(),
    ])
    expect(summary.count).toBe(3)
    expect(summary.hungCount).toBe(1)
    expect(summary.timedOutCount).toBe(1)
  })

  it('computes percentiles over the usable latencies', () => {
    const latencies = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const summary = summarizeSwitchLatencies(latencies.map((latencyMs) => switchSample({ latencyMs })))
    expect(summary.p50).toBe(5)
    expect(summary.p90).toBe(9)
    expect(summary.maxMs).toBe(10)
    expect(summary.meanMs).toBe(5.5)
  })
})

describe('summarizeSeries', () => {
  it('drops non-finite entries', () => {
    const summary = summarizeSeries([1, null, 3, Number.NaN, undefined], 2)
    expect(summary.count).toBe(2)
    expect(summary.mean).toBe(2)
  })

  it('rounds to the requested precision', () => {
    expect(summarizeSeries([1.005, 2.005], 2).mean).toBe(1.51)
    expect(summarizeSeries([1.4, 2.6], 0).mean).toBe(2)
  })
})

describe('cumulativeDelta', () => {
  it('subtracts a rising counter', () => {
    expect(cumulativeDelta(10, 25)).toBe(15)
  })

  it('rejects a counter that went backwards', () => {
    expect(cumulativeDelta(25, 10)).toBe(null)
  })

  it('rejects non-numeric readings', () => {
    expect(cumulativeDelta(null, 5)).toBe(null)
    expect(cumulativeDelta(5, undefined)).toBe(null)
  })
})

describe('summarizeFrames', () => {
  it('marks frame data unavailable when no samples arrived', () => {
    const summary = summarizeFrames([])
    expect(summary.available).toBe(false)
    expect(summary.samples).toBe(0)
  })

  it('marks frame data unavailable when every delta stayed at zero', () => {
    const summary = summarizeFrames([
      { kind: FRAME_RECORD, at: 1, displayed: 0, dropped: 0, late: 0 },
      { kind: FRAME_RECORD, at: 2, displayed: 0, dropped: 0, late: 0 },
    ])
    expect(summary.available).toBe(false)
    expect(summary.samples).toBe(2)
  })

  it('totals moving counters and derives a dropped ratio', () => {
    const summary = summarizeFrames([
      { kind: FRAME_RECORD, at: 1, displayed: 100, dropped: 1, late: 2 },
      { kind: FRAME_RECORD, at: 2, displayed: 100, dropped: 3, late: 0 },
    ])
    expect(summary.available).toBe(true)
    expect(summary.displayed).toBe(200)
    expect(summary.dropped).toBe(4)
    expect(summary.droppedRatio).toBe(0.02)
  })

  it('ignores negative deltas from a counter reset', () => {
    const summary = summarizeFrames([{ kind: FRAME_RECORD, at: 1, displayed: -5, dropped: 2, late: 0 }])
    expect(summary.displayed).toBe(0)
    expect(summary.dropped).toBe(2)
  })
})

describe('summarizeLoad', () => {
  it('summarizes each load dimension', () => {
    const summary = summarizeLoad([
      { kind: LOAD_RECORD, at: 1, cpuPercent: 10, windowCount: 12, processCount: 300 },
      { kind: LOAD_RECORD, at: 2, cpuPercent: 30, windowCount: 14, processCount: 310 },
    ])
    expect(summary.samples).toBe(2)
    expect(summary.cpuPercent.mean).toBe(20)
    expect(summary.windowCount.max).toBe(14)
  })
})

describe('sessionWindow', () => {
  it('returns a zero window for no records', () => {
    expect(sessionWindow([])).toEqual({ startedAt: null, endedAt: null, durationMs: 0 })
  })

  it('spans the first and last stamped record regardless of order', () => {
    const span = sessionWindow([{ at: 500 }, { at: 100 }, { at: 900 }])
    expect(span.startedAt).toBe(100)
    expect(span.endedAt).toBe(900)
    expect(span.durationMs).toBe(800)
  })

  it('ignores records with no usable stamp', () => {
    const span = sessionWindow([{ at: 100 }, { at: null }, {}, { at: 300 }])
    expect(span.durationMs).toBe(200)
  })
})

describe('summarizeSession', () => {
  it('produces every section for a mixed record stream', () => {
    const base = WARMUP_MS
    const summary = summarizeSession(
      settledSession([
        switchSample({ at: base, latencyMs: 2 }),
        switchSample({ at: base + 1000, latencyMs: 8 }),
        counterSample({ at: base + 2000 }),
        { kind: FRAME_RECORD, at: base + 3000, displayed: 60, dropped: 0, late: 0 },
        { kind: LOAD_RECORD, at: base + 4000, cpuPercent: 12, windowCount: 9, processCount: 280 },
      ]),
      'before'
    )
    expect(summary.label).toBe('before')
    expect(summary.recordCount).toBe(5)
    expect(summary.durationMs).toBe(4000)
    expect(summary.switchLatency.count).toBe(2)
    expect(summary.counters.availableMBytes.mean).toBe(40000)
    expect(summary.frames.available).toBe(true)
    expect(summary.load.cpuPercent.mean).toBe(12)
  })

  it('discards the warm-up window so shell startup cannot skew the result', () => {
    const summary = summarizeSession(
      [
        counterSample({ at: 0, values: { pageReadsPerSec: 5000 } }),
        counterSample({ at: WARMUP_MS - 1, values: { pageReadsPerSec: 4000 } }),
        counterSample({ at: WARMUP_MS, values: { pageReadsPerSec: 10 } }),
        counterSample({ at: WARMUP_MS + 5000, values: { pageReadsPerSec: 20 } }),
      ],
      'before'
    )
    expect(summary.discardedWarmupRecords).toBe(2)
    expect(summary.recordCount).toBe(2)
    expect(summary.counters.pageReadsPerSec.mean).toBe(15)
    expect(summary.durationMs).toBe(5000)
  })

  it('tolerates a non-array input', () => {
    const summary = summarizeSession(null, 'empty')
    expect(summary.recordCount).toBe(0)
    expect(summary.switchLatency.count).toBe(0)
  })
})

describe('compareSessions', () => {
  it('returns null when either side is missing', () => {
    expect(compareSessions(null, summarizeSession([], 'a'))).toBe(null)
    expect(compareSessions(summarizeSession([], 'a'), null)).toBe(null)
  })

  it('reports absolute and relative movement per metric', () => {
    const before = summarizeSession(settledSession([switchSample({ latencyMs: 10 })]), 'before')
    const after = summarizeSession(settledSession([switchSample({ latencyMs: 5 })]), 'after')
    const comparison = compareSessions(before, after)
    expect(comparison.switchLatencyP50.before).toBe(10)
    expect(comparison.switchLatencyP50.after).toBe(5)
    expect(comparison.switchLatencyP50.delta).toBe(-5)
    expect(comparison.switchLatencyP50.percentChange).toBe(-50)
  })

  it('leaves the relative change null when the baseline was zero and moved', () => {
    const before = summarizeSession(settledSession([switchSample({ latencyMs: 0 })]), 'before')
    const after = summarizeSession(settledSession([switchSample({ latencyMs: 4 })]), 'after')
    expect(compareSessions(before, after).switchLatencyP50.percentChange).toBe(null)
  })

  it('reports no relative change when both sides are zero', () => {
    const before = summarizeSession(settledSession([switchSample({ latencyMs: 0 })]), 'before')
    const after = summarizeSession(settledSession([switchSample({ latencyMs: 0 })]), 'after')
    expect(compareSessions(before, after).switchLatencyP50.percentChange).toBe(0)
  })
})

describe('isReportableSession', () => {
  function sessionOfLength(durationMs, switchCount) {
    const records = []
    for (let index = 0; index < switchCount; index++) records.push(switchSample({ at: WARMUP_MS + index }))
    records.push({ kind: LOAD_RECORD, at: WARMUP_MS + durationMs, cpuPercent: 1, windowCount: 1, processCount: 1 })
    return summarizeSession(settledSession(records), 'sample')
  }

  it('rejects a session shorter than the useful minimum', () => {
    expect(isReportableSession(sessionOfLength(60 * 1000, 500))).toBe(false)
  })

  it('rejects a long session with too few switches', () => {
    expect(isReportableSession(sessionOfLength(MINIMUM_USEFUL_DURATION_MS + 1, 4))).toBe(false)
  })

  it('accepts a long session with enough switches', () => {
    expect(isReportableSession(sessionOfLength(MINIMUM_USEFUL_DURATION_MS + 1, 200))).toBe(true)
  })

  it('rejects a missing summary', () => {
    expect(isReportableSession(null)).toBe(false)
  })
})

describe('sanitizeLabel', () => {
  it('lowercases and hyphenates a free-form label', () => {
    expect(sanitizeLabel('Before Governor')).toBe('before-governor')
  })

  it('strips leading and trailing separators', () => {
    expect(sanitizeLabel('  --after!!  ')).toBe('after')
  })

  it('falls back to the default for an empty or missing label', () => {
    expect(sanitizeLabel('')).toBe(DEFAULT_LABEL)
    expect(sanitizeLabel('***')).toBe(DEFAULT_LABEL)
    expect(sanitizeLabel(undefined)).toBe(DEFAULT_LABEL)
  })
})

describe('labelFromCommandLine', () => {
  it('returns null when the flag is absent', () => {
    expect(labelFromCommandLine(['electron', '.'])).toBe(null)
  })

  it('reads the label that follows the flag', () => {
    expect(labelFromCommandLine(['electron', '.', '--perf-probe', 'Baseline'])).toBe('baseline')
  })

  it('falls back to the default when the flag ends the arguments', () => {
    expect(labelFromCommandLine(['electron', '.', '--perf-probe'])).toBe(DEFAULT_LABEL)
  })

  it('falls back to the default when another flag follows', () => {
    expect(labelFromCommandLine(['--perf-probe', '--setup'])).toBe(DEFAULT_LABEL)
  })

  it('tolerates a non-array argument list', () => {
    expect(labelFromCommandLine(null)).toBe(null)
  })
})

describe('withoutWarmup', () => {
  it('keeps records once the warm-up window has elapsed', () => {
    const rows = [{ at: 0 }, { at: WARMUP_MS - 1 }, { at: WARMUP_MS }, { at: WARMUP_MS + 1 }]
    expect(withoutWarmup(rows)).toEqual([{ at: WARMUP_MS }, { at: WARMUP_MS + 1 }])
  })

  it('returns everything when no record carries a stamp', () => {
    const rows = [{ kind: 'switch' }, { kind: 'load' }]
    expect(withoutWarmup(rows)).toEqual(rows)
  })

  it('drops a session that never outlived its warm-up', () => {
    expect(withoutWarmup([{ at: 0 }, { at: 100 }])).toEqual([])
  })

  it('tolerates a non-array input', () => {
    expect(withoutWarmup(null)).toEqual([])
  })
})

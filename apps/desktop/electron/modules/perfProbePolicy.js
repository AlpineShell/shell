const LATENCY_PERCENTILES = [50, 75, 90, 95, 99]
const COUNTER_PERCENTILES = [50, 95]

const SWITCH_RECORD = 'switch'
const COUNTER_RECORD = 'counters'
const FRAME_RECORD = 'frames'
const LOAD_RECORD = 'load'

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function ascending(a, b) {
  return a - b
}

function percentile(values, rank) {
  if (!Array.isArray(values) || values.length === 0) return null
  const sorted = [...values].sort(ascending)
  if (rank <= 0) return sorted[0]
  if (rank >= 100) return sorted[sorted.length - 1]
  const index = Math.ceil((rank / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)]
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function round(value, decimals) {
  if (!isFiniteNumber(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function percentileMap(values, ranks, decimals) {
  const result = {}
  for (const rank of ranks) result[`p${rank}`] = round(percentile(values, rank), decimals)
  return result
}

function isMeasurableSwitch(sample) {
  if (!sample || sample.kind !== SWITCH_RECORD) return false
  if (!isFiniteNumber(sample.latencyMs) || sample.latencyMs < 0) return false
  if (sample.shellOwned) return false
  return true
}

function summarizeSwitchLatencies(samples) {
  const usable = (samples ?? []).filter(isMeasurableSwitch)
  const latencies = usable.map((sample) => sample.latencyMs)
  return {
    count: usable.length,
    hungCount: usable.filter((sample) => sample.hung).length,
    timedOutCount: usable.filter((sample) => sample.timedOut).length,
    meanMs: round(mean(latencies), 2),
    maxMs: round(percentile(latencies, 100), 2),
    ...percentileMap(latencies, LATENCY_PERCENTILES, 2),
  }
}

function summarizeSeries(values, decimals) {
  const usable = (values ?? []).filter(isFiniteNumber)
  return {
    count: usable.length,
    mean: round(mean(usable), decimals),
    min: round(percentile(usable, 0), decimals),
    max: round(percentile(usable, 100), decimals),
    ...percentileMap(usable, COUNTER_PERCENTILES, decimals),
  }
}

function counterSeries(records, field) {
  return (records ?? [])
    .filter((record) => record && record.kind === COUNTER_RECORD && record.values)
    .map((record) => record.values[field])
}

function summarizeCounters(records, fields) {
  const summary = {}
  for (const [field, decimals] of Object.entries(fields)) {
    summary[field] = summarizeSeries(counterSeries(records, field), decimals)
  }
  return summary
}

function cumulativeDelta(previous, current) {
  if (!isFiniteNumber(previous) || !isFiniteNumber(current)) return null
  if (current < previous) return null
  return current - previous
}

function summarizeFrames(records) {
  const frames = (records ?? []).filter((record) => record && record.kind === FRAME_RECORD)
  const totals = { displayed: 0, dropped: 0, late: 0 }
  let moved = false
  for (const frame of frames) {
    for (const field of Object.keys(totals)) {
      const delta = frame[field]
      if (!isFiniteNumber(delta) || delta < 0) continue
      if (delta > 0) moved = true
      totals[field] += delta
    }
  }
  if (frames.length === 0) return { available: false, samples: 0, ...totals, droppedRatio: null }
  return {
    available: moved,
    samples: frames.length,
    ...totals,
    droppedRatio: totals.displayed > 0 ? round(totals.dropped / totals.displayed, 6) : null,
  }
}

function summarizeLoad(records) {
  const loads = (records ?? []).filter((record) => record && record.kind === LOAD_RECORD)
  return {
    samples: loads.length,
    cpuPercent: summarizeSeries(loads.map((record) => record.cpuPercent), 2),
    windowCount: summarizeSeries(loads.map((record) => record.windowCount), 0),
    processCount: summarizeSeries(loads.map((record) => record.processCount), 0),
  }
}

function sessionWindow(records) {
  const stamps = (records ?? []).map((record) => record && record.at).filter(isFiniteNumber)
  if (stamps.length === 0) return { startedAt: null, endedAt: null, durationMs: 0 }
  const startedAt = Math.min(...stamps)
  const endedAt = Math.max(...stamps)
  return { startedAt, endedAt, durationMs: endedAt - startedAt }
}

const COUNTER_FIELDS = {
  pageReadsPerSec: 2,
  pagesInputPerSec: 2,
  availableMBytes: 0,
  standbyBytes: 0,
  committedPercent: 2,
}

function summarizeSession(records, label) {
  const rows = Array.isArray(records) ? records : []
  return {
    label: label ?? null,
    ...sessionWindow(rows),
    recordCount: rows.length,
    switchLatency: summarizeSwitchLatencies(rows.filter((record) => record && record.kind === SWITCH_RECORD)),
    counters: summarizeCounters(rows, COUNTER_FIELDS),
    frames: summarizeFrames(rows),
    load: summarizeLoad(rows),
  }
}

function relativeChange(before, after) {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) return null
  if (before === 0) return after === 0 ? 0 : null
  return round(((after - before) / before) * 100, 2)
}

function compareMetric(before, after) {
  return {
    before: isFiniteNumber(before) ? before : null,
    after: isFiniteNumber(after) ? after : null,
    delta: isFiniteNumber(before) && isFiniteNumber(after) ? round(after - before, 2) : null,
    percentChange: relativeChange(before, after),
  }
}

function compareSessions(before, after) {
  if (!before || !after) return null
  return {
    durationMs: { before: before.durationMs, after: after.durationMs },
    sampleCount: { before: before.switchLatency.count, after: after.switchLatency.count },
    switchLatencyP50: compareMetric(before.switchLatency.p50, after.switchLatency.p50),
    switchLatencyP95: compareMetric(before.switchLatency.p95, after.switchLatency.p95),
    switchLatencyP99: compareMetric(before.switchLatency.p99, after.switchLatency.p99),
    switchLatencyMax: compareMetric(before.switchLatency.maxMs, after.switchLatency.maxMs),
    pageReadsPerSecMean: compareMetric(before.counters.pageReadsPerSec.mean, after.counters.pageReadsPerSec.mean),
    pageReadsPerSecP95: compareMetric(before.counters.pageReadsPerSec.p95, after.counters.pageReadsPerSec.p95),
    availableMBytesMean: compareMetric(before.counters.availableMBytes.mean, after.counters.availableMBytes.mean),
    standbyBytesMean: compareMetric(before.counters.standbyBytes.mean, after.counters.standbyBytes.mean),
    cpuPercentMean: compareMetric(before.load.cpuPercent.mean, after.load.cpuPercent.mean),
  }
}

const PROBE_FLAG = '--perf-probe'
const DEFAULT_LABEL = 'session'

function sanitizeLabel(label) {
  const safe = String(label ?? DEFAULT_LABEL).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || DEFAULT_LABEL
}

function labelFromCommandLine(argv) {
  const args = Array.isArray(argv) ? argv : []
  const index = args.indexOf(PROBE_FLAG)
  if (index === -1) return null
  const value = args[index + 1]
  if (typeof value !== 'string' || value.startsWith('--')) return DEFAULT_LABEL
  return sanitizeLabel(value)
}

const MINIMUM_USEFUL_DURATION_MS = 30 * 60 * 1000
const MINIMUM_USEFUL_SWITCHES = 100

function isReportableSession(summary) {
  if (!summary) return false
  if (summary.durationMs < MINIMUM_USEFUL_DURATION_MS) return false
  return summary.switchLatency.count >= MINIMUM_USEFUL_SWITCHES
}

module.exports = {
  PROBE_FLAG,
  DEFAULT_LABEL,
  sanitizeLabel,
  labelFromCommandLine,
  SWITCH_RECORD,
  COUNTER_RECORD,
  FRAME_RECORD,
  LOAD_RECORD,
  LATENCY_PERCENTILES,
  COUNTER_FIELDS,
  MINIMUM_USEFUL_DURATION_MS,
  MINIMUM_USEFUL_SWITCHES,
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
}

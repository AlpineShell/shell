const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const MAX_SAMPLES_PER_SERIES = 4096
const SWITCH_ACK_TIMEOUT_MS = 1000

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function roundHundredths(value) {
  return Math.round(value * 100) / 100
}

function ascendingValues(samples, field) {
  return (samples ?? [])
    .map(sample => (sample ? sample[field] : undefined))
    .filter(isFiniteNumber)
    .sort((a, b) => a - b)
}

function percentileOfAscending(ascending, fraction) {
  if (!ascending.length) return null
  const rank = Math.ceil(fraction * ascending.length)
  return ascending[Math.min(ascending.length - 1, Math.max(0, rank - 1))]
}

function percentile(values, fraction) {
  const ascending = (values ?? []).filter(isFiniteNumber).sort((a, b) => a - b)
  return percentileOfAscending(ascending, fraction)
}

function withinWindow(samples, nowMs, windowMs) {
  const oldestKept = nowMs - windowMs
  const kept = (samples ?? []).filter(sample => isFiniteNumber(sample?.at) && sample.at >= oldestKept && sample.at <= nowMs)
  return kept.length > MAX_SAMPLES_PER_SERIES ? kept.slice(kept.length - MAX_SAMPLES_PER_SERIES) : kept
}

function appendSample(samples, sample, nowMs, windowMs) {
  return withinWindow([...(samples ?? []), sample], nowMs, windowMs)
}

function summarizeSwitchLatency(samples) {
  const ascending = ascendingValues(samples, 'latencyMs')
  return {
    count: ascending.length,
    timedOutCount: (samples ?? []).filter(sample => sample && sample.timedOut === true).length,
    p50Ms: percentileOfAscending(ascending, 0.5),
    p95Ms: percentileOfAscending(ascending, 0.95),
    minMs: ascending.length ? ascending[0] : null,
    maxMs: ascending.length ? ascending[ascending.length - 1] : null,
  }
}

function summarizeHardFaults(samples) {
  const ascending = ascendingValues(samples, 'pageReadsPerSecond')
  const total = ascending.reduce((sum, value) => sum + value, 0)
  return {
    count: ascending.length,
    p50PerSecond: percentileOfAscending(ascending, 0.5),
    p95PerSecond: percentileOfAscending(ascending, 0.95),
    maxPerSecond: ascending.length ? ascending[ascending.length - 1] : null,
    meanPerSecond: ascending.length ? roundHundredths(total / ascending.length) : null,
  }
}

function latestField(samples, field) {
  for (let index = (samples ?? []).length - 1; index >= 0; index -= 1) {
    const value = samples[index] ? samples[index][field] : undefined
    if (isFiniteNumber(value)) return value
  }
  return null
}

function summarizeMemory(samples) {
  const availableAscending = ascendingValues(samples, 'availableBytes')
  const standbyAscending = ascendingValues(samples, 'standbyBytes')
  return {
    count: (samples ?? []).length,
    totalBytes: latestField(samples, 'totalBytes'),
    availableBytes: latestField(samples, 'availableBytes'),
    standbyBytes: latestField(samples, 'standbyBytes'),
    minAvailableBytes: availableAscending.length ? availableAscending[0] : null,
    minStandbyBytes: standbyAscending.length ? standbyAscending[0] : null,
  }
}

function summarizeDwmFrames(samples) {
  const readable = (samples ?? []).filter(
    sample => sample && sample.supported === true && isFiniteNumber(sample.framesLate) && isFiniteNumber(sample.framesDropped)
  )
  if (!readable.length) {
    return { supported: false, refreshRateHz: null, framesLate: null, framesDropped: null }
  }
  const first = readable[0]
  const last = readable[readable.length - 1]
  return {
    supported: true,
    refreshRateHz: isFiniteNumber(last.refreshRateHz) ? last.refreshRateHz : null,
    framesLate: Math.max(0, last.framesLate - first.framesLate),
    framesDropped: Math.max(0, last.framesDropped - first.framesDropped),
  }
}

function summarizePerfProbe({ nowMs, windowMs, switches, pageReads, memory, dwmFrames }) {
  const span = isFiniteNumber(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS
  return {
    sampledAt: nowMs,
    windowMs: span,
    foregroundSwitch: summarizeSwitchLatency(withinWindow(switches, nowMs, span)),
    hardFaults: summarizeHardFaults(withinWindow(pageReads, nowMs, span)),
    memory: summarizeMemory(withinWindow(memory, nowMs, span)),
    dwmFrames: summarizeDwmFrames(withinWindow(dwmFrames, nowMs, span)),
  }
}

module.exports = {
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
}

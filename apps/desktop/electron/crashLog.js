const { createDiagnosticLog } = require('./diagnosticLog')

const CRASH_LOG_FILE = 'crash-log.json'
const CRASH_LOG_MAX_ENTRIES = 100
const MAX_DETAIL_CHARS = 4000
const REPEAT_QUIET_MS = 60 * 1000
const MAX_REMEMBERED_REPEATS = 200

function truncateText(value, maxChars = MAX_DETAIL_CHARS) {
  const text = String(value)
  return text.length > maxChars ? text.slice(0, maxChars) : text
}

function describeError(error) {
  if (error instanceof Error) return truncateText(error.stack || `${error.name}: ${error.message}`)
  return truncateText(error)
}

function createRepeatFilter({ quietMs = REPEAT_QUIET_MS, maxRemembered = MAX_REMEMBERED_REPEATS, clock = Date.now } = {}) {
  const lastRecorded = new Map()
  return function isRepeat(key) {
    const now = clock()
    const previous = lastRecorded.get(key)
    if (previous !== undefined && now - previous < quietMs) return true
    if (lastRecorded.size >= maxRemembered) lastRecorded.clear()
    lastRecorded.set(key, now)
    return false
  }
}

function createCrashLog({ log, isRepeat = createRepeatFilter() } = {}) {
  const target = log || createDiagnosticLog({ fileName: CRASH_LOG_FILE, maxEntries: CRASH_LOG_MAX_ENTRIES })
  return {
    record(kind, detail) {
      if (isRepeat(`${kind}:${JSON.stringify(detail ?? null)}`)) return
      target.record(kind, detail)
    },
  }
}

module.exports = {
  MAX_DETAIL_CHARS,
  truncateText,
  describeError,
  createRepeatFilter,
  createCrashLog,
}

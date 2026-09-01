const JOURNAL_VERSION = 1

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  if (!isPositiveInteger(entry.pid)) return false
  if (typeof entry.startTime !== 'string' || entry.startTime.length === 0) return false
  return true
}

function entryKey(entry) {
  return `${entry.pid}:${entry.startTime}`
}

function createJournal() {
  return { version: JOURNAL_VERSION, entries: [] }
}

function parseJournal(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return createJournal()
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (_) {
    return createJournal()
  }
  if (!parsed || parsed.version !== JOURNAL_VERSION || !Array.isArray(parsed.entries)) return createJournal()
  const seen = new Set()
  const entries = []
  for (const entry of parsed.entries) {
    if (!isValidEntry(entry)) continue
    const key = entryKey(entry)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ pid: entry.pid, startTime: entry.startTime, name: typeof entry.name === 'string' ? entry.name : null })
  }
  return { version: JOURNAL_VERSION, entries }
}

function serializeJournal(journal) {
  const entries = (journal?.entries ?? []).filter(isValidEntry)
  return JSON.stringify({ version: JOURNAL_VERSION, entries }, null, 2)
}

function withEntry(journal, entry) {
  if (!isValidEntry(entry)) return journal
  const key = entryKey(entry)
  if ((journal?.entries ?? []).some((existing) => entryKey(existing) === key)) return journal
  return { version: JOURNAL_VERSION, entries: [...(journal?.entries ?? []), entry] }
}

function withoutPid(journal, pid) {
  const entries = (journal?.entries ?? []).filter((entry) => entry.pid !== pid)
  if (entries.length === (journal?.entries ?? []).length) return journal
  return { version: JOURNAL_VERSION, entries }
}

function isSameProcess(entry, live) {
  if (!isValidEntry(entry) || !live) return false
  return entry.pid === live.pid && entry.startTime === live.startTime
}

function recoverableEntries(journal, liveProcessesByPid) {
  const recoverable = []
  for (const entry of journal?.entries ?? []) {
    const live = liveProcessesByPid?.get?.(entry.pid)
    if (isSameProcess(entry, live)) recoverable.push(entry)
  }
  return recoverable
}

function staleEntries(journal, liveProcessesByPid) {
  const stale = []
  for (const entry of journal?.entries ?? []) {
    const live = liveProcessesByPid?.get?.(entry.pid)
    if (!isSameProcess(entry, live)) stale.push(entry)
  }
  return stale
}

module.exports = {
  JOURNAL_VERSION,
  isValidEntry,
  entryKey,
  createJournal,
  parseJournal,
  serializeJournal,
  withEntry,
  withoutPid,
  isSameProcess,
  recoverableEntries,
  staleEntries,
}

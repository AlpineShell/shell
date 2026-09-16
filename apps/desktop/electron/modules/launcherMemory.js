const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const MEMORY_VERSION = 2
const RECENT_CAP = 10
const QUERY_CAP_PER_ITEM = 24
const MAX_QUERY_LENGTH = 64
const QUERY_HALF_LIFE_MS = 30 * DAY
const STALE_ITEM_MS = 365 * DAY
const MIN_QUERY_WEIGHT = 0.01

function emptyMemory() {
  return { version: MEMORY_VERSION, items: {} }
}

function normalizeKey(key) {
  if (!key) return ''
  return String(key).trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase()
}

function normalizeQuery(query) {
  return String(query ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH)
}

function sanitizeQueries(queries) {
  const clean = {}
  if (!queries || typeof queries !== 'object') return clean
  for (const [query, entry] of Object.entries(queries)) {
    if (entry && Number.isFinite(entry.count) && Number.isFinite(entry.last)) {
      clean[query] = { count: entry.count, last: entry.last }
    }
  }
  return clean
}

function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') return null
  const recent = Array.isArray(record.recent) ? record.recent.filter(Number.isFinite).slice(0, RECENT_CAP) : []
  return {
    count: Number.isFinite(record.count) ? record.count : recent.length,
    recent,
    queries: sanitizeQueries(record.queries),
  }
}

function migrateMemory(parsed) {
  if (!parsed || typeof parsed !== 'object') return emptyMemory()
  const source = parsed.version === MEMORY_VERSION ? parsed.items : parsed.apps
  const memory = emptyMemory()
  if (!source || typeof source !== 'object') return memory
  for (const [key, record] of Object.entries(source)) {
    const clean = sanitizeRecord(record)
    if (clean) memory.items[key] = clean
  }
  return memory
}

function queryWeight(entry, now) {
  const age = Math.max(0, now - entry.last)
  return entry.count * 0.5 ** (age / QUERY_HALF_LIFE_MS)
}

function trimQueries(queries, now) {
  const entries = Object.entries(queries)
  if (entries.length <= QUERY_CAP_PER_ITEM) return
  entries.sort((a, b) => queryWeight(b[1], now) - queryWeight(a[1], now))
  for (const [query] of entries.slice(QUERY_CAP_PER_ITEM)) delete queries[query]
}

function recordSelection(memory, rawKey, rawQuery, now) {
  const key = normalizeKey(rawKey)
  if (!key) return false
  const record = memory.items[key] ?? (memory.items[key] = { count: 0, recent: [], queries: {} })
  record.count += 1
  record.recent.unshift(now)
  if (record.recent.length > RECENT_CAP) record.recent.length = RECENT_CAP
  const query = normalizeQuery(rawQuery)
  if (query) {
    const entry = record.queries[query] ?? { count: 0, last: 0 }
    entry.count += 1
    entry.last = now
    record.queries[query] = entry
    trimQueries(record.queries, now)
  }
  return true
}

function recencyPoints(age) {
  if (age <= 4 * HOUR) return 100
  if (age <= DAY) return 80
  if (age <= 3 * DAY) return 60
  if (age <= 7 * DAY) return 40
  if (age <= 30 * DAY) return 20
  if (age <= 90 * DAY) return 10
  return 0
}

function usageScore(record, now) {
  if (!record.recent.length) return 0
  const points = record.recent.reduce((sum, launchedAt) => sum + recencyPoints(now - launchedAt), 0)
  return record.count * (points / record.recent.length)
}

function roundWeight(weight) {
  return Math.round(weight * 1000) / 1000
}

function snapshotMemory(memory, now) {
  const usage = {}
  const queries = {}
  for (const [key, record] of Object.entries(memory.items)) {
    const score = Math.round(usageScore(record, now))
    if (score > 0) usage[key] = score
    const weights = {}
    for (const [query, entry] of Object.entries(record.queries)) {
      const weight = queryWeight(entry, now)
      if (weight >= MIN_QUERY_WEIGHT) weights[query] = roundWeight(weight)
    }
    if (Object.keys(weights).length) queries[key] = weights
  }
  return { usage, queries }
}

function pruneMemory(memory, now) {
  for (const [key, record] of Object.entries(memory.items)) {
    const lastUsed = record.recent[0] ?? 0
    if (now - lastUsed > STALE_ITEM_MS) delete memory.items[key]
  }
}

module.exports = {
  QUERY_CAP_PER_ITEM,
  QUERY_HALF_LIFE_MS,
  emptyMemory,
  normalizeKey,
  normalizeQuery,
  migrateMemory,
  recordSelection,
  snapshotMemory,
  pruneMemory,
}

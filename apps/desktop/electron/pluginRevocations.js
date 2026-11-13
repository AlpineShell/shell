const fs = require('fs')
const path = require('path')
const { verifySignature } = require('./pluginSignature')

const REVOCATIONS_CACHE_FILE_NAME = 'plugin-revocations.json'
const REVOCATIONS_KEY = 'plugins/revoked.json'
const FIRST_CHECK_DELAY_MS = 10 * 1000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 20000

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function unsignedPart(doc) {
  const rest = { ...doc }
  delete rest.signature
  return rest
}

function isRevocationEntry(entry) {
  return (
    Boolean(entry) &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    (entry.version === null || entry.version === undefined || typeof entry.version === 'string') &&
    (entry.reason === undefined || entry.reason === null || typeof entry.reason === 'string')
  )
}

function normalizedEntries(revoked) {
  return revoked.map((entry) => ({
    id: entry.id,
    version: typeof entry.version === 'string' && entry.version ? entry.version : null,
    reason: typeof entry.reason === 'string' ? entry.reason : '',
  }))
}

function verifyRevocationList(doc, { publicKey, allowUnsigned }) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'malformed' }
  if (doc.version !== 1 || !Array.isArray(doc.revoked) || !doc.revoked.every(isRevocationEntry)) {
    return { ok: false, reason: 'malformed' }
  }
  if (publicKey) {
    const signed = Buffer.from(canonicalJson(unsignedPart(doc)), 'utf8')
    if (!verifySignature(signed, doc.signature, publicKey)) return { ok: false, reason: 'bad-signature' }
    return { ok: true, unsigned: false, issuedAt: issuedAtOf(doc), entries: normalizedEntries(doc.revoked) }
  }
  if (!allowUnsigned) return { ok: false, reason: 'no-key' }
  return { ok: true, unsigned: true, issuedAt: issuedAtOf(doc), entries: normalizedEntries(doc.revoked) }
}

function issuedAtOf(doc) {
  const time = Date.parse(doc && doc.issuedAt)
  return Number.isFinite(time) ? time : 0
}

function findRevocation(entries, id, version) {
  if (!Array.isArray(entries)) return null
  return entries.find((entry) => entry.id === id && (entry.version === null || entry.version === version)) || null
}

function sameEntries(a, b) {
  return canonicalJson(a) === canonicalJson(b)
}

function readCachedDoc(cacheFile) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.error('[plugin-revocations] cache read error:', e.message)
    return null
  }
}

function writeCachedDoc(cacheFile, doc) {
  const tmp = `${cacheFile}.tmp`
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(doc))
    fs.renameSync(tmp, cacheFile)
  } catch (e) {
    console.error('[plugin-revocations] cache write error:', e && e.message)
  }
}

async function fetchRevocationDoc(url, fetchImpl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { signal: controller.signal, redirect: 'follow', cache: 'no-store' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`http-${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function createRevocationWatcher({ cacheFile, listUrl, keys, fetchImpl = (...args) => fetch(...args), onChange = () => {} }) {
  let entries = null
  let issuedAt = 0
  let warnedUnsigned = false
  let firstTimer = null
  let interval = null

  function verify(doc) {
    const result = verifyRevocationList(doc, keys())
    if (result.ok && result.unsigned && !warnedUnsigned) {
      warnedUnsigned = true
      console.warn('[plugin-revocations] no marketplace key in this development build, accepting an unsigned revocation list')
    }
    return result
  }

  function loadCache() {
    entries = []
    issuedAt = 0
    const doc = readCachedDoc(cacheFile)
    if (!doc) return
    const result = verify(doc)
    if (!result.ok) {
      console.error('[plugin-revocations] cached list refused:', result.reason)
      return
    }
    entries = result.entries
    issuedAt = result.issuedAt
  }

  function current() {
    if (entries === null) loadCache()
    return entries
  }

  async function refresh() {
    const before = current()
    let doc
    try {
      doc = await fetchRevocationDoc(listUrl(), fetchImpl)
    } catch (e) {
      console.error('[plugin-revocations] fetch failed, keeping the last list:', e && e.message)
      return { ok: false, reason: 'unreachable', entries: before }
    }
    if (!doc) return { ok: false, reason: 'not-published', entries: before }
    const result = verify(doc)
    if (!result.ok) {
      console.error('[plugin-revocations] list refused:', result.reason)
      return { ok: false, reason: result.reason, entries: before }
    }
    if (result.issuedAt < issuedAt) return { ok: false, reason: 'older', entries: before }
    writeCachedDoc(cacheFile, doc)
    entries = result.entries
    issuedAt = result.issuedAt
    const changed = !sameEntries(before, entries)
    if (changed) onChange(entries)
    return { ok: true, changed, entries }
  }

  function start() {
    stop()
    firstTimer = setTimeout(() => {
      firstTimer = null
      refresh()
      interval = setInterval(refresh, CHECK_INTERVAL_MS)
    }, FIRST_CHECK_DELAY_MS)
  }

  function stop() {
    if (firstTimer) clearTimeout(firstTimer)
    if (interval) clearInterval(interval)
    firstTimer = null
    interval = null
  }

  return { current, refresh, start, stop }
}

module.exports = {
  REVOCATIONS_CACHE_FILE_NAME,
  REVOCATIONS_KEY,
  FIRST_CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  canonicalJson,
  verifyRevocationList,
  findRevocation,
  createRevocationWatcher,
}

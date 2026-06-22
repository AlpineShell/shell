const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const RECENT_CAP = 10
const WRITE_DEBOUNCE = 1500

let data = { version: 1, apps: {} }
let loaded = false
let broadcast = null
let writeTimer = null
let filePath = null

function resolvePath() {
  if (!filePath) filePath = path.join(app.getPath('userData'), 'frecency.json')
  return filePath
}

function normalizeKey(target) {
  if (!target) return ''
  return String(target).trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase()
}

function ensureLoaded() {
  if (loaded) return
  loaded = true
  let raw
  try {
    raw = fs.readFileSync(resolvePath(), 'utf-8')
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[frecency] read error:', e.message)
    return
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.apps === 'object' && parsed.apps) {
      data = { version: 1, apps: parsed.apps }
    }
  } catch (e) {
    console.error('[frecency] corrupt file, starting fresh:', e.message)
    try { fs.renameSync(resolvePath(), resolvePath() + '.bak') } catch {}
  }
}

function flush() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null }
  if (!loaded) return
  const tmp = resolvePath() + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, resolvePath())
  } catch (e) {
    console.error('[frecency] write error:', e.message)
  }
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flush, WRITE_DEBOUNCE)
}

function record(target) {
  const key = normalizeKey(target)
  if (!key) return
  ensureLoaded()
  const now = Date.now()
  let rec = data.apps[key]
  if (!rec) {
    rec = { count: 0, lastLaunchedAt: 0, recent: [] }
    data.apps[key] = rec
  }
  rec.count += 1
  rec.lastLaunchedAt = now
  rec.recent.unshift(now)
  if (rec.recent.length > RECENT_CAP) rec.recent.length = RECENT_CAP
  scheduleWrite()
  if (broadcast) broadcast('frecency/changed', computeScores())
}

function recencyPoints(dt) {
  if (dt <= 4 * HOUR) return 100
  if (dt <= DAY) return 80
  if (dt <= 3 * DAY) return 60
  if (dt <= 7 * DAY) return 40
  if (dt <= 30 * DAY) return 20
  if (dt <= 90 * DAY) return 10
  return 0
}

function frecencyOf(rec, now) {
  if (!rec || !Array.isArray(rec.recent) || rec.recent.length === 0) return 0
  let sum = 0
  for (const t of rec.recent) sum += recencyPoints(now - t)
  return rec.count * (sum / rec.recent.length)
}

function computeScores() {
  ensureLoaded()
  const now = Date.now()
  const out = {}
  for (const [key, rec] of Object.entries(data.apps)) {
    const value = Math.round(frecencyOf(rec, now))
    if (value > 0) out[key] = value
  }
  return out
}

module.exports = {
  handlers: {
    'frecency/scores': () => computeScores(),
  },
  record,
  flush,
  start(b) {
    broadcast = b
    ensureLoaded()
    app.on('before-quit', flush)
    app.on('will-quit', flush)
    app.on('quit', flush)
  },
}

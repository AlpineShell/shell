const path = require('path')
const fs = require('fs')
const {
  emptyMemory,
  migrateMemory,
  recordSelection,
  snapshotMemory,
  pruneMemory,
} = require('./launcherMemory')

const WRITE_DEBOUNCE = 1500

let memory = emptyMemory()
let loaded = false
let broadcast = null
let writeTimer = null
let filePath = null

function resolvePath() {
  if (!filePath) {
    const { app } = require('electron')
    filePath = path.join(app.getPath('userData'), 'frecency.json')
  }
  return filePath
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
    memory = migrateMemory(JSON.parse(raw))
    pruneMemory(memory, Date.now())
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
    fs.writeFileSync(tmp, JSON.stringify(memory))
    fs.renameSync(tmp, resolvePath())
  } catch (e) {
    console.error('[frecency] write error:', e.message)
  }
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flush, WRITE_DEBOUNCE)
}

function snapshot() {
  ensureLoaded()
  return snapshotMemory(memory, Date.now())
}

function record(key, query) {
  ensureLoaded()
  if (!recordSelection(memory, key, query, Date.now())) return false
  scheduleWrite()
  if (broadcast) broadcast('frecency/changed', snapshot())
  return true
}

module.exports = {
  handlers: {
    'frecency/scores': () => snapshot(),
    'frecency/record': (_event, key, query) => (typeof key === 'string' ? record(key, typeof query === 'string' ? query : '') : false),
  },
  record,
  flush,
  start(b) {
    const { app } = require('electron')
    broadcast = b
    ensureLoaded()
    app.on('before-quit', flush)
    app.on('will-quit', flush)
    app.on('quit', flush)
  },
}

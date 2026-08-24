const path = require('path')
const winsqlite = require('./winsqlite')

const WORKER_ENTRY = path.join(__dirname, 'sqliteWorkerEntry.js')
const REQUEST_TIMEOUT_MS = 20000
const RETRY_DELAY_MS = 300000
const MAX_CONSECUTIVE_EXITS = 3

let worker = null
let quitHookInstalled = false
let consecutiveExits = 0
let disabledUntilMs = 0
let nextRequestId = 1
const pending = new Map()

function rejectPending(reason) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer)
    entry.reject(new Error(reason))
  }
  pending.clear()
}

function dropWorker(reason) {
  const dead = worker
  worker = null
  rejectPending(reason)
  if (dead) { try { dead.kill() } catch {} }
}

function disable(reason) {
  disabledUntilMs = Date.now() + RETRY_DELAY_MS
  dropWorker(reason)
}

function toBuffers(rows) {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const value = row[i]
      if (ArrayBuffer.isView(value) && !Buffer.isBuffer(value)) {
        row[i] = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      }
    }
  }
  return rows
}

function handleMessage(message) {
  if (!message || typeof message.id !== 'number') return
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  clearTimeout(entry.timer)
  if (message.ok) {
    consecutiveExits = 0
    entry.resolve(message)
  } else {
    entry.reject(new Error(message.reason || 'sqlite worker request failed'))
  }
}

function ensureWorker() {
  if (worker) return worker
  if (Date.now() < disabledUntilMs) return null
  let electron
  try {
    electron = require('electron')
  } catch {
    disable('electron unavailable')
    return null
  }
  let proc
  try {
    proc = electron.utilityProcess.fork(WORKER_ENTRY, [], { serviceName: 'alpine-sqlite' })
  } catch (e) {
    console.error('[sqliteWorker] fork failed:', (e && e.message) || e)
    disable('fork failed')
    return null
  }
  worker = proc
  proc.on('message', handleMessage)
  proc.on('exit', () => {
    if (worker !== proc) return
    worker = null
    rejectPending('sqlite worker exited')
    if (++consecutiveExits >= MAX_CONSECUTIVE_EXITS) disable('sqlite worker keeps exiting')
  })
  if (!quitHookInstalled) {
    quitHookInstalled = true
    electron.app.once('will-quit', () => dropWorker('shutting down'))
  }
  return worker
}

function request(proc, payload) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++
    const timer = setTimeout(() => {
      pending.delete(id)
      dropWorker('sqlite worker timed out')
      reject(new Error('sqlite worker timed out'))
    }, REQUEST_TIMEOUT_MS)
    if (typeof timer.unref === 'function') timer.unref()
    pending.set(id, { resolve, reject, timer })
    try {
      proc.postMessage({ id, ...payload })
    } catch (e) {
      pending.delete(id)
      clearTimeout(timer)
      reject(e)
    }
  })
}

function toRowsResult(message) {
  if (!Array.isArray(message.rows)) throw new Error('sqlite worker returned no rows')
  return { rows: toBuffers(message.rows), truncated: !!message.truncated }
}

function workerQuery(proc, sessionId) {
  return async (sql, columnTypes, rowLimit) => toRowsResult(await request(proc, { op: 'query', sessionId, sql, columnTypes, rowLimit }))
}

function localQuery(session) {
  return async (sql, columnTypes, rowLimit) => winsqlite.querySnapshot(session, sql, columnTypes, rowLimit)
}

async function runOnWorkerSnapshot(proc, dbPath, run) {
  const opened = await request(proc, { op: 'open', dbPath })
  if (typeof opened.sessionId !== 'number') throw new Error('sqlite worker opened no snapshot')
  try {
    return await run(workerQuery(proc, opened.sessionId))
  } finally {
    request(proc, { op: 'close', sessionId: opened.sessionId }).catch(() => {})
  }
}

async function runOnLocalSnapshot(dbPath, run) {
  const session = winsqlite.openSnapshot(dbPath)
  try {
    return await run(localQuery(session))
  } finally {
    winsqlite.closeSnapshot(session)
  }
}

async function withSnapshot(dbPath, run) {
  const proc = ensureWorker()
  if (proc) {
    try {
      return await runOnWorkerSnapshot(proc, dbPath, run)
    } catch (e) {
      console.error('[sqliteWorker] falling back to an in-process snapshot:', (e && e.message) || e)
    }
  }
  return runOnLocalSnapshot(dbPath, run)
}

async function readRows(dbPath, sql, columnTypes, rowLimit) {
  const proc = ensureWorker()
  if (proc) {
    try {
      return toRowsResult(await request(proc, { op: 'readRows', dbPath, sql, columnTypes, rowLimit }))
    } catch (e) {
      console.error('[sqliteWorker] falling back to an in-process read:', (e && e.message) || e)
    }
  }
  return winsqlite.readRows(dbPath, sql, columnTypes, rowLimit)
}

function warm() {
  ensureWorker()
}

module.exports = { readRows, withSnapshot, warm, dispose: () => dropWorker('disposed') }

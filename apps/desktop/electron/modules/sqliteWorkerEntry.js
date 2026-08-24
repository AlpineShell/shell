const winsqlite = require('./winsqlite')

const SESSION_IDLE_MS = 60000

const sessions = new Map()
let nextSessionId = 1

function reply(message) {
  process.parentPort.postMessage(message)
}

function closeSession(sessionId) {
  const entry = sessions.get(sessionId)
  if (!entry) return
  sessions.delete(sessionId)
  clearTimeout(entry.idleTimer)
  winsqlite.closeSnapshot(entry.session)
}

function armIdleTimer(sessionId, entry) {
  clearTimeout(entry.idleTimer)
  entry.idleTimer = setTimeout(() => closeSession(sessionId), SESSION_IDLE_MS)
  if (typeof entry.idleTimer.unref === 'function') entry.idleTimer.unref()
}

function openSession(dbPath) {
  const session = winsqlite.openSnapshot(dbPath)
  if (!session) return null
  const sessionId = nextSessionId++
  const entry = { session, idleTimer: null }
  sessions.set(sessionId, entry)
  armIdleTimer(sessionId, entry)
  return sessionId
}

function handleOpen(request) {
  const sessionId = openSession(request.dbPath)
  if (sessionId === null) {
    reply({ id: request.id, ok: false, reason: 'could not snapshot the database' })
    return
  }
  reply({ id: request.id, ok: true, sessionId })
}

function handleQuery(request) {
  const entry = sessions.get(request.sessionId)
  if (!entry) {
    reply({ id: request.id, ok: false, reason: 'unknown sqlite snapshot session' })
    return
  }
  armIdleTimer(request.sessionId, entry)
  const { rows, truncated } = winsqlite.querySnapshot(entry.session, request.sql, request.columnTypes, request.rowLimit)
  reply({ id: request.id, ok: true, rows, truncated })
}

function handleClose(request) {
  closeSession(request.sessionId)
  reply({ id: request.id, ok: true })
}

function handleReadRows(request) {
  const { rows, truncated } = winsqlite.readRows(request.dbPath, request.sql, request.columnTypes, request.rowLimit)
  reply({ id: request.id, ok: true, rows, truncated })
}

const handlers = { open: handleOpen, query: handleQuery, close: handleClose, readRows: handleReadRows }

process.parentPort.on('message', (event) => {
  const request = event && event.data
  if (!request || typeof request.id !== 'number') return
  if (!winsqlite.available()) {
    reply({ id: request.id, ok: false, reason: 'winsqlite3 unavailable in worker' })
    return
  }
  const handler = handlers[request.op]
  if (!handler) {
    reply({ id: request.id, ok: false, reason: `unknown sqlite worker op: ${request.op}` })
    return
  }
  try {
    handler(request)
  } catch (e) {
    reply({ id: request.id, ok: false, reason: (e && e.message) || String(e) })
  }
})

process.on('exit', () => {
  for (const sessionId of [...sessions.keys()]) closeSession(sessionId)
})

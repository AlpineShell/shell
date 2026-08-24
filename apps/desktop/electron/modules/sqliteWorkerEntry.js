const winsqlite = require('./winsqlite')

function reply(message) {
  process.parentPort.postMessage(message)
}

process.parentPort.on('message', (event) => {
  const request = event && event.data
  if (!request || typeof request.id !== 'number') return
  if (!winsqlite.available()) {
    reply({ id: request.id, ok: false, reason: 'winsqlite3 unavailable in worker' })
    return
  }
  try {
    reply({ id: request.id, ok: true, rows: winsqlite.readRows(request.dbPath, request.sql, request.columnTypes, request.rowLimit) })
  } catch (e) {
    reply({ id: request.id, ok: false, reason: (e && e.message) || String(e) })
  }
})

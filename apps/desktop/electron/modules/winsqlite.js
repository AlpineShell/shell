const fs = require('fs')
const path = require('path')
const os = require('os')

const SQLITE_OPEN_READWRITE = 0x00000002
const SQLITE_OK = 0
const SQLITE_ROW = 100
const MAX_BLOB_BYTES = 256 * 1024

let koffi = null
let fns = null

function ensureLib() {
  if (fns !== null) return fns
  try {
    koffi = require('koffi')
    const lib = koffi.load('winsqlite3.dll')
    fns = {
      open: lib.func('int sqlite3_open_v2(const char *, _Out_ void **, int, const char *)'),
      prepare: lib.func('int sqlite3_prepare_v2(void *, const char *, int, _Out_ void **, _Out_ void **)'),
      step: lib.func('int sqlite3_step(void *)'),
      colBytes: lib.func('int sqlite3_column_bytes(void *, int)'),
      colBlob: lib.func('void *sqlite3_column_blob(void *, int)'),
      colText: lib.func('const char *sqlite3_column_text(void *, int)'),
      colInt: lib.func('int sqlite3_column_int(void *, int)'),
      finalize: lib.func('int sqlite3_finalize(void *)'),
      close: lib.func('int sqlite3_close(void *)'),
    }
  } catch (e) {
    console.error('[winsqlite] winsqlite3 unavailable:', e.message)
    fns = false
  }
  return fns
}

function available() {
  return !!ensureLib()
}

function emptyResult() {
  return { rows: [], truncated: false }
}

function snapshot(dbPath) {
  const tmp = path.join(os.tmpdir(), `alpine-sqlite-${process.pid}-${Date.now()}-${Math.round(process.hrtime()[1])}.db`)
  fs.copyFileSync(dbPath, tmp)
  for (const ext of ['-wal', '-journal']) {
    try {
      if (fs.existsSync(dbPath + ext) && fs.statSync(dbPath + ext).size > 0) fs.copyFileSync(dbPath + ext, tmp + ext)
    } catch {}
  }
  return tmp
}

function cleanup(tmp) {
  for (const ext of ['', '-wal', '-shm', '-journal']) {
    try { fs.unlinkSync(tmp + ext) } catch {}
  }
}

function decodeColumn(f, stmt, index, type) {
  if (type === 'text') return f.colText(stmt, index)
  if (type === 'int') return f.colInt(stmt, index)
  const n = f.colBytes(stmt, index)
  if (n <= 0 || n > MAX_BLOB_BYTES) return null
  return Buffer.from(koffi.decode(f.colBlob(stmt, index), koffi.array('uint8_t', n)))
}

function collectRows(f, db, sql, columnTypes, rowLimit) {
  const stmtOut = [null]
  if (f.prepare(db, sql, -1, stmtOut, [null]) !== SQLITE_OK) return emptyResult()
  const stmt = stmtOut[0]
  const rows = []
  let truncated = false
  try {
    while (f.step(stmt) === SQLITE_ROW) {
      if (rows.length >= rowLimit) { truncated = true; break }
      const row = []
      for (let i = 0; i < columnTypes.length; i++) row.push(decodeColumn(f, stmt, i, columnTypes[i]))
      rows.push(row)
    }
  } finally {
    f.finalize(stmt)
  }
  return { rows, truncated }
}

function readRows(dbPath, sql, columnTypes, rowLimit = 100000) {
  const f = ensureLib()
  if (!f || !dbPath || !fs.existsSync(dbPath)) return emptyResult()
  let tmp = null
  try {
    tmp = snapshot(dbPath)
    const dbOut = [null]
    const opened = f.open(tmp, dbOut, SQLITE_OPEN_READWRITE, null)
    if (!dbOut[0]) return emptyResult()
    try {
      if (opened !== SQLITE_OK) return emptyResult()
      return collectRows(f, dbOut[0], sql, columnTypes, rowLimit)
    } finally {
      f.close(dbOut[0])
    }
  } catch (e) {
    console.error('[winsqlite] query error:', e.message)
    return emptyResult()
  } finally {
    if (tmp) cleanup(tmp)
  }
}

module.exports = { readRows, available }

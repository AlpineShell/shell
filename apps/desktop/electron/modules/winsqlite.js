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

function readRows(dbPath, sql, columnTypes, rowLimit = 100000) {
  const f = ensureLib()
  const rows = []
  if (!f || !dbPath || !fs.existsSync(dbPath)) return rows

  let tmp = null
  try {
    tmp = snapshot(dbPath)
    const dbOut = [null]
    if (f.open(tmp, dbOut, SQLITE_OPEN_READWRITE, null) !== SQLITE_OK) return rows
    const db = dbOut[0]
    const stmtOut = [null]
    if (f.prepare(db, sql, -1, stmtOut, [null]) !== SQLITE_OK) { f.close(db); return rows }
    const stmt = stmtOut[0]

    while (rows.length < rowLimit && f.step(stmt) === SQLITE_ROW) {
      const row = []
      for (let i = 0; i < columnTypes.length; i++) {
        const type = columnTypes[i]
        if (type === 'text') {
          row.push(f.colText(stmt, i))
        } else if (type === 'int') {
          row.push(f.colInt(stmt, i))
        } else {
          const n = f.colBytes(stmt, i)
          if (n <= 0 || n > MAX_BLOB_BYTES) { row.push(null); continue }
          row.push(Buffer.from(koffi.decode(f.colBlob(stmt, i), koffi.array('uint8_t', n))))
        }
      }
      rows.push(row)
    }

    f.finalize(stmt)
    f.close(db)
  } catch (e) {
    console.error('[winsqlite] query error:', e.message)
  } finally {
    if (tmp) cleanup(tmp)
  }
  return rows
}

module.exports = { readRows, available }

const fs = require('fs')
const path = require('path')
const os = require('os')

const SQLITE_OPEN_READONLY = 0x00000001
const SQLITE_OK = 0
const SQLITE_ROW = 100
const MAX_ICON_BYTES = 128 * 1024

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
      finalize: lib.func('int sqlite3_finalize(void *)'),
      close: lib.func('int sqlite3_close(void *)'),
    }
  } catch (e) {
    console.error('[favicons] winsqlite3 unavailable:', e.message)
    fns = false
  }
  return fns
}

function readFaviconMap(faviconsDbPath, neededHosts) {
  const f = ensureLib()
  const map = new Map()
  if (!f || !faviconsDbPath || !fs.existsSync(faviconsDbPath)) return map
  if (neededHosts && neededHosts.size === 0) return map

  let tmp = null
  try {
    tmp = path.join(os.tmpdir(), `alpine-favicons-${process.pid}-${Date.now()}.db`)
    fs.copyFileSync(faviconsDbPath, tmp)

    const dbOut = [null]
    if (f.open(tmp, dbOut, SQLITE_OPEN_READONLY, null) !== SQLITE_OK) return map
    const db = dbOut[0]

    const sql = `SELECT im.page_url, fb.image_data
      FROM icon_mapping im JOIN favicon_bitmaps fb ON fb.icon_id = im.icon_id
      WHERE fb.image_data IS NOT NULL AND length(fb.image_data) > 0
      ORDER BY fb.width DESC`
    const stmtOut = [null]
    if (f.prepare(db, sql, -1, stmtOut, [null]) !== SQLITE_OK) { f.close(db); return map }
    const stmt = stmtOut[0]

    while (f.step(stmt) === SQLITE_ROW) {
      const pageUrl = f.colText(stmt, 0)
      const n = f.colBytes(stmt, 1)
      if (!pageUrl || n <= 0 || n > MAX_ICON_BYTES) continue
      let host
      try { host = new URL(pageUrl).hostname } catch { continue }
      if (!host || map.has(host)) continue
      if (neededHosts && !neededHosts.has(host)) continue
      const ptr = f.colBlob(stmt, 1)
      const bytes = koffi.decode(ptr, koffi.array('uint8_t', n))
      map.set(host, 'data:image/png;base64,' + Buffer.from(bytes).toString('base64'))
    }

    f.finalize(stmt)
    f.close(db)
  } catch (e) {
    console.error('[favicons] read error:', e.message)
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp) } catch {} }
  }
  return map
}

module.exports = { readFaviconMap }

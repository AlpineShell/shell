const fs = require('fs')
const path = require('path')
const sqliteWorker = require('./sqliteWorker')
const { faviconMapFromSnapshot, PREFERRED_ICON_PX } = require('./browserFavicons')

const MAX_BOOKMARKS = 3000

const FIREFOX_ICON_MAPPING_SQL = `SELECT pg.page_url, ip.icon_id
    FROM moz_pages_w_icons pg JOIN moz_icons_to_pages ip ON ip.page_id = pg.id
    ORDER BY pg.id DESC`

function firefoxIconSql(iconIds) {
  return `SELECT id, data FROM moz_icons
    WHERE id IN (${iconIds.join(',')}) AND data IS NOT NULL AND length(data) > 0
    ORDER BY (width >= ${PREFERRED_ICON_PX}) DESC, ABS(width - ${PREFERRED_ICON_PX}) ASC`
}

function firefoxBase() {
  return path.join(process.env.APPDATA || '', 'Mozilla', 'Firefox')
}

function parseIniSections(text) {
  const sections = []
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const header = line.match(/^\[(.+)\]$/)
    if (header) { current = { name: header[1], keys: new Map() }; sections.push(current); continue }
    const eq = line.indexOf('=')
    if (eq > 0 && current) current.keys.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim())
  }
  return sections
}

function resolveProfileDir() {
  const base = firefoxBase()
  const toAbs = (p) => path.join(base, p.replace(/\//g, path.sep))
  const hasPlaces = (dir) => { try { return fs.existsSync(path.join(dir, 'places.sqlite')) } catch { return false } }
  const readSections = (file) => {
    try { return parseIniSections(fs.readFileSync(path.join(base, file), 'utf8')) } catch { return [] }
  }

  // 1. installs.ini Default= (per-install default profile)
  for (const section of readSections('installs.ini')) {
    const def = section.keys.get('Default')
    if (def) { const dir = toAbs(def); if (hasPlaces(dir)) return dir }
  }

  const profiles = readSections('profiles.ini')

  // 2. profiles.ini [Install*] Default= (authoritative for modern Firefox)
  for (const section of profiles) {
    if (!/^Install/i.test(section.name)) continue
    const def = section.keys.get('Default')
    if (def) { const dir = toAbs(def); if (hasPlaces(dir)) return dir }
  }

  // 3. profiles.ini [Profile*] Default=1 (legacy)
  for (const section of profiles) {
    if (!/^Profile/i.test(section.name)) continue
    if (section.keys.get('Default') !== '1') continue
    const p = section.keys.get('Path')
    if (!p) continue
    const dir = section.keys.get('IsRelative') === '0' ? p : toAbs(p)
    if (hasPlaces(dir)) return dir
  }

  // 4. any profile that actually has data, preferring default-release
  let fallback = null
  for (const section of profiles) {
    if (!/^Profile/i.test(section.name)) continue
    const p = section.keys.get('Path')
    if (!p) continue
    const dir = section.keys.get('IsRelative') === '0' ? p : toAbs(p)
    if (!hasPlaces(dir)) continue
    if (/\.default-release/i.test(p)) return dir
    if (!fallback) fallback = dir
  }
  return fallback
}

async function readBookmarks(profileDir) {
  const placesDb = path.join(profileDir, 'places.sqlite')
  const sql = `SELECT p.url, b.title
    FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk
    WHERE b.type = 1 AND p.url LIKE 'http%'
    ORDER BY b.dateAdded DESC`
  const { rows } = await sqliteWorker.readRows(placesDb, sql, ['text', 'text'], MAX_BOOKMARKS)
  const seen = new Set()
  const out = []
  for (const [url, title] of rows) {
    if (!url || !/^https?:\/\//i.test(url)) continue
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ title: (title && title.trim()) || url, url })
  }
  return out
}

function toDataUrl(buf) {
  if (!buf || buf.length < 4) return null
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'data:image/png;base64,' + buf.toString('base64')
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'data:image/jpeg;base64,' + buf.toString('base64')
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'data:image/gif;base64,' + buf.toString('base64')
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'data:image/x-icon;base64,' + buf.toString('base64')
  const head = buf.slice(0, 64).toString('latin1').toLowerCase()
  if (head.includes('<svg') || head.trimStart().startsWith('<?xml')) return 'data:image/svg+xml;base64,' + buf.toString('base64')
  return null
}

const FIREFOX_DIALECT = {
  mappingSql: FIREFOX_ICON_MAPPING_SQL,
  mappingLabel: 'moz_icons_to_pages',
  bitmapSql: firefoxIconSql,
  toIcon: toDataUrl,
}

async function readFaviconMap(profileDir, neededHosts) {
  if (!neededHosts || neededHosts.size === 0) return new Map()
  const faviconsDb = path.join(profileDir, 'favicons.sqlite')
  if (!fs.existsSync(faviconsDb)) return new Map()
  return sqliteWorker.withSnapshot(faviconsDb, (query) => faviconMapFromSnapshot(query, neededHosts, FIREFOX_DIALECT))
}

module.exports = { resolveProfileDir, readBookmarks, readFaviconMap }

const winsqlite = require('./winsqlite')

const MAX_FILTERED_HOSTS = 100
const SAFE_HOST = /^[a-z0-9.\-:[\]]+$/i

function hostRangeClauses(hosts, column) {
  const clauses = []
  let count = 0
  for (const host of hosts) {
    if (!SAFE_HOST.test(host)) continue
    if (++count > MAX_FILTERED_HOSTS) break
    for (const scheme of ['http://', 'https://']) {
      clauses.push(`(${column} >= '${scheme}${host}/' AND ${column} < '${scheme}${host}0')`)
      clauses.push(`(${column} >= '${scheme}${host}:' AND ${column} < '${scheme}${host};')`)
    }
  }
  return clauses
}

function collectByHost(rows, neededHosts, toIcon) {
  const map = new Map()
  for (const [pageUrl, data] of rows) {
    if (!pageUrl || !data) continue
    let host
    try { host = new URL(pageUrl).hostname } catch { continue }
    if (!host || map.has(host)) continue
    if (neededHosts && !neededHosts.has(host)) continue
    const icon = toIcon(data)
    if (icon) map.set(host, icon)
  }
  return map
}

function toPngDataUrl(data) {
  if (!data || data.length === 0) return null
  return 'data:image/png;base64,' + data.toString('base64')
}

// Chromium's Favicons DB stores every icon as a PNG blob in favicon_bitmaps,
// mapped to page URLs via icon_mapping.
function readFaviconMap(faviconsDbPath, neededHosts) {
  if (!faviconsDbPath || (neededHosts && neededHosts.size === 0)) return new Map()

  const sql = `SELECT im.page_url, fb.image_data
    FROM icon_mapping im JOIN favicon_bitmaps fb ON fb.icon_id = im.icon_id
    WHERE fb.image_data IS NOT NULL AND length(fb.image_data) > 0
    ORDER BY fb.width DESC`
  const rows = winsqlite.readRows(faviconsDbPath, sql, ['text', 'blob'])
  return collectByHost(rows, neededHosts, toPngDataUrl)
}

function readFaviconMapForHosts(faviconsDbPath, neededHosts) {
  if (!faviconsDbPath || !neededHosts || neededHosts.size === 0) return new Map()
  const clauses = hostRangeClauses(neededHosts, 'im.page_url')
  if (clauses.length === 0) return new Map()

  const sql = `SELECT MIN(im.page_url), fb.image_data
    FROM icon_mapping im JOIN favicon_bitmaps fb ON fb.icon_id = im.icon_id
    WHERE fb.image_data IS NOT NULL AND (${clauses.join(' OR ')})
    GROUP BY fb.id
    ORDER BY fb.width DESC`
  const rows = winsqlite.readRows(faviconsDbPath, sql, ['text', 'blob'])
  return collectByHost(rows, neededHosts, toPngDataUrl)
}

module.exports = { readFaviconMap, readFaviconMapForHosts, hostRangeClauses, collectByHost }

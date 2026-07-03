const winsqlite = require('./winsqlite')

// Chromium's Favicons DB stores every icon as a PNG blob in favicon_bitmaps,
// mapped to page URLs via icon_mapping.
function readFaviconMap(faviconsDbPath, neededHosts) {
  const map = new Map()
  if (!faviconsDbPath || (neededHosts && neededHosts.size === 0)) return map

  const sql = `SELECT im.page_url, fb.image_data
    FROM icon_mapping im JOIN favicon_bitmaps fb ON fb.icon_id = im.icon_id
    WHERE fb.image_data IS NOT NULL AND length(fb.image_data) > 0
    ORDER BY fb.width DESC`
  const rows = winsqlite.readRows(faviconsDbPath, sql, ['text', 'blob'])

  for (const [pageUrl, data] of rows) {
    if (!pageUrl || !data) continue
    let host
    try { host = new URL(pageUrl).hostname } catch { continue }
    if (!host || map.has(host)) continue
    if (neededHosts && !neededHosts.has(host)) continue
    map.set(host, 'data:image/png;base64,' + data.toString('base64'))
  }
  return map
}

module.exports = { readFaviconMap }

const sqliteWorker = require('./sqliteWorker')

const ICON_ID_BATCH = 500
const PREFERRED_ICON_PX = 64

const CHROMIUM_ICON_MAPPING_SQL = 'SELECT page_url, icon_id FROM icon_mapping'

function chromiumBitmapSql(iconIds) {
  return `SELECT icon_id, image_data FROM favicon_bitmaps
    WHERE icon_id IN (${iconIds.join(',')}) AND image_data IS NOT NULL AND length(image_data) > 0
    ORDER BY (width >= ${PREFERRED_ICON_PX}) DESC, ABS(width - ${PREFERRED_ICON_PX}) ASC`
}

function preferredIconIdByHost(rows, neededHosts) {
  const countsByHost = new Map()
  for (const [pageUrl, iconId] of rows) {
    if (!pageUrl || !Number.isInteger(iconId) || iconId <= 0) continue
    let host
    try { host = new URL(pageUrl).host } catch { continue }
    if (!host || !neededHosts.has(host)) continue
    let counts = countsByHost.get(host)
    if (!counts) { counts = new Map(); countsByHost.set(host, counts) }
    counts.set(iconId, (counts.get(iconId) || 0) + 1)
  }
  const byHost = new Map()
  for (const [host, counts] of countsByHost) {
    let bestId = 0
    let bestCount = 0
    for (const [iconId, count] of counts) {
      if (count > bestCount || (count === bestCount && iconId > bestId)) { bestId = iconId; bestCount = count }
    }
    byHost.set(host, bestId)
  }
  return byHost
}

function idBatches(iconIds) {
  const out = []
  for (let i = 0; i < iconIds.length; i += ICON_ID_BATCH) out.push(iconIds.slice(i, i + ICON_ID_BATCH))
  return out
}

function collectBlobs(rows, blobById) {
  for (const [id, data] of rows) {
    if (data && data.length > 0 && !blobById.has(id)) blobById.set(id, data)
  }
  return blobById
}

async function readIconBlobs(dbPath, iconIds, buildSql) {
  const blobById = new Map()
  for (const batch of idBatches(iconIds)) {
    collectBlobs(await sqliteWorker.readRows(dbPath, buildSql(batch), ['int', 'blob']), blobById)
  }
  return blobById
}

function iconMapFromBlobs(iconIdByHost, blobById, toIcon) {
  const map = new Map()
  for (const [host, iconId] of iconIdByHost) {
    const icon = toIcon(blobById.get(iconId))
    if (icon) map.set(host, icon)
  }
  return map
}

function toPngDataUrl(data) {
  if (!data || data.length === 0) return null
  return 'data:image/png;base64,' + data.toString('base64')
}

async function readFaviconMap(faviconsDbPath, neededHosts) {
  if (!faviconsDbPath || !neededHosts || neededHosts.size === 0) return new Map()
  const mappings = await sqliteWorker.readRows(faviconsDbPath, CHROMIUM_ICON_MAPPING_SQL, ['text', 'int'])
  const iconIdByHost = preferredIconIdByHost(mappings, neededHosts)
  if (iconIdByHost.size === 0) return new Map()
  const blobById = await readIconBlobs(faviconsDbPath, [...new Set(iconIdByHost.values())], chromiumBitmapSql)
  return iconMapFromBlobs(iconIdByHost, blobById, toPngDataUrl)
}

module.exports = {
  readFaviconMap,
  preferredIconIdByHost,
  readIconBlobs,
  iconMapFromBlobs,
  idBatches,
  collectBlobs,
  PREFERRED_ICON_PX,
}

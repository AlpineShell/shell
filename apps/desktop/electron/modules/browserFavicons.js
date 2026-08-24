const sqliteWorker = require('./sqliteWorker')

const ICON_ID_BATCH = 500
const ICON_CANDIDATES_PER_HOST = 3
const ICON_MAPPING_ROW_LIMIT = 200000
const PREFERRED_ICON_PX = 64

const CHROMIUM_ICON_MAPPING_SQL = 'SELECT page_url, icon_id FROM icon_mapping ORDER BY rowid DESC'

function chromiumBitmapSql(iconIds) {
  return `SELECT icon_id, image_data FROM favicon_bitmaps
    WHERE icon_id IN (${iconIds.join(',')}) AND image_data IS NOT NULL AND length(image_data) > 0
    ORDER BY (width >= ${PREFERRED_ICON_PX}) DESC, ABS(width - ${PREFERRED_ICON_PX}) ASC`
}

function warnIfTruncated(label, truncated) {
  if (truncated) console.error(`[browserFavicons] ${label} hit the ${ICON_MAPPING_ROW_LIMIT} row limit; the oldest mappings were not read`)
}

function rankedIconIdsByHost(rows, neededHosts) {
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
    byHost.set(host, [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]).map(([iconId]) => iconId))
  }
  return byHost
}

function candidateIds(iconIdsByHost, perHost = ICON_CANDIDATES_PER_HOST) {
  const ids = new Set()
  for (const ranked of iconIdsByHost.values()) {
    for (const iconId of ranked.slice(0, perHost)) ids.add(iconId)
  }
  return [...ids]
}

function remainingCandidateIds(iconIdsByHost, resolvedHosts, alreadyAsked = new Set()) {
  const ids = new Set()
  for (const [host, ranked] of iconIdsByHost) {
    if (resolvedHosts.has(host)) continue
    for (const iconId of ranked) {
      if (!alreadyAsked.has(iconId)) ids.add(iconId)
    }
  }
  return [...ids]
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

async function readIconBlobs(query, iconIds, buildSql, blobById = new Map()) {
  for (const batch of idBatches(iconIds)) {
    const { rows } = await query(buildSql(batch), ['int', 'blob'])
    collectBlobs(rows, blobById)
  }
  return blobById
}

function iconMapFromBlobs(iconIdsByHost, blobById, toIcon) {
  const map = new Map()
  for (const [host, ranked] of iconIdsByHost) {
    for (const iconId of ranked) {
      const icon = toIcon(blobById.get(iconId))
      if (icon) { map.set(host, icon); break }
    }
  }
  return map
}

async function faviconMapFromSnapshot(query, neededHosts, dialect) {
  const { rows, truncated } = await query(dialect.mappingSql, ['text', 'int'], ICON_MAPPING_ROW_LIMIT)
  warnIfTruncated(dialect.mappingLabel, truncated)
  const iconIdsByHost = rankedIconIdsByHost(rows, neededHosts)
  if (iconIdsByHost.size === 0) return new Map()
  const asked = candidateIds(iconIdsByHost)
  const blobById = await readIconBlobs(query, asked, dialect.bitmapSql)
  const map = iconMapFromBlobs(iconIdsByHost, blobById, dialect.toIcon)
  const remaining = remainingCandidateIds(iconIdsByHost, new Set(map.keys()), new Set(asked))
  if (remaining.length === 0) return map
  await readIconBlobs(query, remaining, dialect.bitmapSql, blobById)
  return iconMapFromBlobs(iconIdsByHost, blobById, dialect.toIcon)
}

function toPngDataUrl(data) {
  if (!data || data.length === 0) return null
  return 'data:image/png;base64,' + data.toString('base64')
}

const CHROMIUM_DIALECT = {
  mappingSql: CHROMIUM_ICON_MAPPING_SQL,
  mappingLabel: 'icon_mapping',
  bitmapSql: chromiumBitmapSql,
  toIcon: toPngDataUrl,
}

async function readFaviconMap(faviconsDbPath, neededHosts) {
  if (!faviconsDbPath || !neededHosts || neededHosts.size === 0) return new Map()
  return sqliteWorker.withSnapshot(faviconsDbPath, (query) => faviconMapFromSnapshot(query, neededHosts, CHROMIUM_DIALECT))
}

module.exports = {
  readFaviconMap,
  faviconMapFromSnapshot,
  rankedIconIdsByHost,
  candidateIds,
  remainingCandidateIds,
  readIconBlobs,
  iconMapFromBlobs,
  idBatches,
  collectBlobs,
  warnIfTruncated,
  ICON_CANDIDATES_PER_HOST,
  ICON_MAPPING_ROW_LIMIT,
  PREFERRED_ICON_PX,
}

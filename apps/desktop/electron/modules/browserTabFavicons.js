const fs = require('fs')
const path = require('path')
const sqliteWorker = require('./sqliteWorker')
const browserFavicons = require('./browserFavicons')
const firefoxData = require('./firefoxData')
const chromiumPaths = require('./chromiumPaths')

const HISTORY_ROW_LIMIT = 5000
const CACHE_TTL_MS = 60000
const FAILED_READ_TTL_MS = 5000
const UNKNOWN_TITLE_REFRESH_MS = 15000

const CHROMIUM_HISTORY_SQL =
  `SELECT title, url FROM urls WHERE title IS NOT NULL AND title != '' AND url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT ${HISTORY_ROW_LIMIT}`
const FIREFOX_HISTORY_SQL =
  `SELECT title, url FROM moz_places WHERE title IS NOT NULL AND title != '' AND url LIKE 'http%' ORDER BY last_visit_date DESC LIMIT ${HISTORY_ROW_LIMIT}`

const cacheByBrowser = new Map()
const pendingByBrowser = new Map()

function titleHostMapFromRows(rows) {
  const map = new Map()
  for (const [title, url] of rows) {
    if (!title || map.has(title)) continue
    try { map.set(title, new URL(url).host) } catch {}
  }
  return map
}

function mergeFirstWins(target, source) {
  for (const [key, value] of source) {
    if (!target.has(key)) target.set(key, value)
  }
}

function neededHosts(tabs, titleHost) {
  const hosts = new Set()
  for (const tab of tabs) {
    const host = titleHost.get(tab.title)
    if (host) hosts.add(host)
  }
  return hosts
}

function chromiumProfileDirs(userDataDir) {
  const hasHistory = (dir) => { try { return fs.existsSync(path.join(dir, 'History')) } catch { return false } }
  const dirs = []
  if (hasHistory(userDataDir)) dirs.push(userDataDir)
  let names = []
  try { names = fs.readdirSync(userDataDir) } catch { return dirs }
  for (const name of names) {
    if (!/^(Default|Profile \d+)$/.test(name)) continue
    const dir = path.join(userDataDir, name)
    if (hasHistory(dir)) dirs.push(dir)
  }
  return dirs
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function chromiumMaps(browser, tabs) {
  const userDataDir = chromiumPaths.userDataDirForProcess(browser)
  if (!userDataDir) return null
  const profileDirs = chromiumProfileDirs(userDataDir)
  if (profileDirs.length === 0) return null

  const titleHost = new Map()
  for (const dir of profileDirs) {
    const rows = await sqliteWorker.readRows(path.join(dir, 'History'), CHROMIUM_HISTORY_SQL, ['text', 'text'], HISTORY_ROW_LIMIT)
    mergeFirstWins(titleHost, titleHostMapFromRows(rows))
    await yieldToEventLoop()
  }

  const hosts = neededHosts(tabs, titleHost)
  const iconByHost = new Map()
  for (const dir of profileDirs) {
    if (hosts.size === 0) break
    const faviconsDb = path.join(dir, 'Favicons')
    if (!fs.existsSync(faviconsDb)) continue
    mergeFirstWins(iconByHost, await browserFavicons.readFaviconMap(faviconsDb, hosts))
    await yieldToEventLoop()
  }
  return { titleHost, iconByHost }
}

async function firefoxMaps(tabs) {
  const profileDir = firefoxData.resolveProfileDir()
  if (!profileDir) return null

  const rows = await sqliteWorker.readRows(path.join(profileDir, 'places.sqlite'), FIREFOX_HISTORY_SQL, ['text', 'text'], HISTORY_ROW_LIMIT)
  const titleHost = titleHostMapFromRows(rows)
  await yieldToEventLoop()

  const hosts = neededHosts(tabs, titleHost)
  const iconByHost = hosts.size > 0 ? await firefoxData.readFaviconMap(profileDir, hosts) : new Map()
  return { titleHost, iconByHost }
}

function mapsFor(browser, tabs) {
  const cached = cacheByBrowser.get(browser)
  if (cached && isFresh(cached, tabs)) return Promise.resolve(cached.maps)
  const pending = pendingByBrowser.get(browser)
  if (pending) return pending
  const read = (async () => {
    let maps = null
    try {
      maps = browser === 'firefox' ? await firefoxMaps(tabs) : await chromiumMaps(browser, tabs)
    } catch (e) {
      console.error('[browserTabFavicons] read error:', e?.message ?? e)
    }
    const unresolvedTitles = new Set()
    if (maps) {
      for (const tab of tabs) {
        if (!hostForTitle(maps.titleHost, tab.title)) unresolvedTitles.add(tab.title)
      }
    }
    cacheByBrowser.set(browser, { atMs: Date.now(), maps, unresolvedTitles })
    pendingByBrowser.delete(browser)
    return maps
  })()
  pendingByBrowser.set(browser, read)
  return read
}

function groupByBrowser(tabs) {
  const byBrowser = new Map()
  for (const tab of tabs) {
    if (!byBrowser.has(tab.browser)) byBrowser.set(tab.browser, [])
    byBrowser.get(tab.browser).push(tab)
  }
  return byBrowser
}

const NOTIFICATION_PREFIX = /^\(\d+\)\s+/

function hostForTitle(titleHost, title) {
  const direct = titleHost.get(title)
  if (direct) return direct
  const stripped = title.replace(NOTIFICATION_PREFIX, '')
  return stripped !== title ? titleHost.get(stripped) : undefined
}

function applyMaps(tabs, maps) {
  if (!maps) return 0
  let attached = 0
  for (const tab of tabs) {
    const host = hostForTitle(maps.titleHost, tab.title)
    if (!host) continue
    tab.host = host
    const icon = maps.iconByHost.get(host)
    if (icon) tab.favicon = icon
    attached++
  }
  return attached
}

function isFresh(entry, tabs) {
  const age = Date.now() - entry.atMs
  const succeeded = !!(entry.maps && entry.maps.titleHost.size > 0)
  if (age >= (succeeded ? CACHE_TTL_MS : FAILED_READ_TTL_MS)) return false
  if (!succeeded || age < UNKNOWN_TITLE_REFRESH_MS) return true
  for (const tab of tabs) {
    if (!hostForTitle(entry.maps.titleHost, tab.title) && !entry.unresolvedTitles.has(tab.title)) return false
  }
  return true
}

function attachFromCache(tabs) {
  let attached = 0
  let complete = true
  for (const [browser, group] of groupByBrowser(tabs)) {
    const cached = cacheByBrowser.get(browser)
    if (cached) attached += applyMaps(group, cached.maps)
    if (!cached || !isFresh(cached, group)) complete = false
  }
  return { attached, complete }
}

async function attachFavicons(tabs) {
  let attached = 0
  for (const [browser, group] of groupByBrowser(tabs)) {
    attached += applyMaps(group, await mapsFor(browser, group))
  }
  return attached
}

module.exports = { attachFavicons, attachFromCache, applyMaps, titleHostMapFromRows }

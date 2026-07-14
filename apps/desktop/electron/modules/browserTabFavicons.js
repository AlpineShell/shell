const fs = require('fs')
const path = require('path')
const winsqlite = require('./winsqlite')
const browserFavicons = require('./browserFavicons')
const firefoxData = require('./firefoxData')
const chromiumPaths = require('./chromiumPaths')

const HISTORY_ROW_LIMIT = 5000
const CACHE_TTL_MS = 60000

const CHROMIUM_HISTORY_SQL =
  "SELECT title, url FROM urls WHERE title IS NOT NULL AND title != '' AND url LIKE 'http%' ORDER BY last_visit_time DESC"
const FIREFOX_HISTORY_SQL =
  "SELECT title, url FROM moz_places WHERE title IS NOT NULL AND title != '' AND url LIKE 'http%' ORDER BY last_visit_date DESC"

const cacheByBrowser = new Map()

function titleHostMapFromRows(rows) {
  const map = new Map()
  for (const [title, url] of rows) {
    if (!title || map.has(title)) continue
    try { map.set(title, new URL(url).hostname) } catch {}
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
    const rows = winsqlite.readRows(path.join(dir, 'History'), CHROMIUM_HISTORY_SQL, ['text', 'text'], HISTORY_ROW_LIMIT)
    mergeFirstWins(titleHost, titleHostMapFromRows(rows))
    await yieldToEventLoop()
  }

  const hosts = neededHosts(tabs, titleHost)
  const iconByHost = new Map()
  for (const dir of profileDirs) {
    if (hosts.size === 0) break
    const faviconsDb = path.join(dir, 'Favicons')
    if (!fs.existsSync(faviconsDb)) continue
    mergeFirstWins(iconByHost, browserFavicons.readFaviconMap(faviconsDb, hosts))
    await yieldToEventLoop()
  }
  return { titleHost, iconByHost }
}

async function firefoxMaps(tabs) {
  const profileDir = firefoxData.resolveProfileDir()
  if (!profileDir) return null

  const rows = winsqlite.readRows(path.join(profileDir, 'places.sqlite'), FIREFOX_HISTORY_SQL, ['text', 'text'], HISTORY_ROW_LIMIT)
  const titleHost = titleHostMapFromRows(rows)
  await yieldToEventLoop()

  const hosts = neededHosts(tabs, titleHost)
  const iconByHost = hosts.size > 0 ? firefoxData.readFaviconMap(profileDir, hosts) : new Map()
  return { titleHost, iconByHost }
}

async function mapsFor(browser, tabs) {
  const now = Date.now()
  const cached = cacheByBrowser.get(browser)
  if (cached && now - cached.atMs < CACHE_TTL_MS) return cached.maps
  let maps = null
  try {
    maps = browser === 'firefox' ? await firefoxMaps(tabs) : await chromiumMaps(browser, tabs)
  } catch (e) {
    console.error('[browserTabFavicons] read error:', e?.message ?? e)
  }
  cacheByBrowser.set(browser, { atMs: now, maps })
  return maps
}

async function attachFavicons(tabs) {
  const byBrowser = new Map()
  for (const tab of tabs) {
    if (!byBrowser.has(tab.browser)) byBrowser.set(tab.browser, [])
    byBrowser.get(tab.browser).push(tab)
  }

  let attached = 0
  for (const [browser, group] of byBrowser) {
    const maps = await mapsFor(browser, group)
    if (!maps) continue
    for (const tab of group) {
      const host = maps.titleHost.get(tab.title)
      if (!host) continue
      const icon = maps.iconByHost.get(host)
      if (icon) {
        tab.favicon = icon
        attached++
      }
    }
  }
  return attached
}

module.exports = { attachFavicons, titleHostMapFromRows }

const { shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const frecency = require('./frecency')
const browserFavicons = require('./browserFavicons')
const firefoxData = require('./firefoxData')
const chromiumPaths = require('./chromiumPaths')
const launcherPrefs = require('./launcherPrefs')

const MAX_BOOKMARKS = 3000
const RELOAD_DEBOUNCE_MS = 600
const WARM_DELAY_MS = 45000
const DEFAULT_BROWSER_KEY = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice'

let broadcast = null
let bookmarks = []
let loaded = false
let loading = null
let watcher = null
let reloadTimer = null
let lastPublishedSignature = null

function getDefaultBrowserProgId() {
  return new Promise((resolve) => {
    execFile('reg', ['query', DEFAULT_BROWSER_KEY, '/v', 'ProgId'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null)
      const match = String(stdout).match(/ProgId\s+REG_SZ\s+(.+)/i)
      resolve(match ? match[1].trim() : null)
    })
  })
}

function isFirefox(progId) {
  return !!progId && /firefox/i.test(progId)
}

async function loadFromBrowser() {
  const progId = await getDefaultBrowserProgId()

  if (isFirefox(progId)) {
    const profileDir = firefoxData.resolveProfileDir()
    if (!profileDir) return { list: [], watchFile: null, watchName: null }
    const list = await firefoxData.readBookmarks(profileDir)
    await attachFavicons(list, (hosts) => firefoxData.readFaviconMap(profileDir, hosts))
    return { list, watchFile: path.join(profileDir, 'places.sqlite'), watchName: 'places.sqlite' }
  }

  const userDataDir = chromiumPaths.userDataDirForProgId(progId)
  if (!userDataDir) return { list: [], watchFile: null, watchName: null }
  const profileDir = path.join(userDataDir, chromiumPaths.lastUsedProfileName(userDataDir, 'Bookmarks'))
  const bookmarksFile = path.join(profileDir, 'Bookmarks')
  if (!fs.existsSync(bookmarksFile)) return { list: [], watchFile: null, watchName: null }
  const list = await parseBookmarks(bookmarksFile)
  const faviconsFile = path.join(profileDir, 'Favicons')
  if (fs.existsSync(faviconsFile)) await attachFavicons(list, (hosts) => browserFavicons.readFaviconMap(faviconsFile, hosts))
  return { list, watchFile: bookmarksFile, watchName: 'Bookmarks' }
}

function hostOf(url) {
  try { return new URL(url).host } catch { return '' }
}

async function attachFavicons(list, readMap) {
  const neededHosts = new Set()
  for (const entry of list) {
    const host = hostOf(entry.url)
    if (host) neededHosts.add(host)
  }
  if (neededHosts.size === 0) return
  let iconByHost
  try { iconByHost = await readMap(neededHosts) } catch { return }
  for (const entry of list) {
    const icon = iconByHost.get(hostOf(entry.url))
    if (icon) entry.favicon = icon
  }
}

function flatten(node, out) {
  if (!node || out.length >= MAX_BOOKMARKS) return
  if (node.type === 'url' && typeof node.url === 'string') {
    if (/^https?:\/\//i.test(node.url)) {
      out.push({ title: (node.name && node.name.trim()) || node.url, url: node.url })
    }
  } else if (Array.isArray(node.children)) {
    for (const child of node.children) flatten(child, out)
  }
}

async function parseBookmarks(file) {
  try {
    const data = JSON.parse(await fs.promises.readFile(file, 'utf8'))
    const roots = data && data.roots
    if (!roots || typeof roots !== 'object') return []
    const collected = []
    for (const key of Object.keys(roots)) flatten(roots[key], collected)
    const seen = new Set()
    const deduped = []
    for (const entry of collected) {
      const key = entry.url.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(entry)
    }
    return deduped
  } catch (e) {
    console.error('[bookmarks] parse error:', e.message)
    return []
  }
}

function signatureOf(list) {
  return list.map((entry) => `${entry.url}\u0000${entry.title}\u0000${entry.favicon ? entry.favicon.length : 0}`).join('')
}

function publish() {
  const signature = signatureOf(bookmarks)
  if (signature === lastPublishedSignature) return
  lastPublishedSignature = signature
  if (broadcast) broadcast('bookmarks/changed', bookmarks)
}

function watch(file, name) {
  if (watcher) return
  try {
    watcher = fs.watch(path.dirname(file), (_event, filename) => {
      if (filename && filename !== name) return
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        reload().catch((e) => console.error('[bookmarks] reload error:', e.message))
      }, RELOAD_DEBOUNCE_MS)
    })
  } catch (e) {
    console.error('[bookmarks] watch error:', e.message)
  }
}

async function reload() {
  const { list, watchFile, watchName } = await loadFromBrowser()
  bookmarks = list
  publish()
  if (watchFile) watch(watchFile, watchName)
}

function ensureLoaded() {
  if (loaded) return Promise.resolve()
  if (!loading) {
    loading = reload()
      .then(() => { loaded = true })
      .catch((e) => { console.error('[bookmarks] load error:', e.message) })
      .finally(() => { loading = null })
  }
  return loading
}

module.exports = {
  handlers: {
    'bookmarks/list': () => {
      if (loaded) return bookmarks
      return ensureLoaded().then(() => bookmarks)
    },
    'bookmarks/open': (_event, url) => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false }
      shell.openExternal(url).catch((e) => console.error('[bookmarks] open error:', e.message))
      frecency.record(url)
      return { ok: true }
    },
  },
  start(b) {
    broadcast = b
    setTimeout(() => {
      if (launcherPrefs.getShowBookmarks()) ensureLoaded()
    }, WARM_DELAY_MS)
  },
}

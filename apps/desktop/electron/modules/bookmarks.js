const { shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const frecency = require('./frecency')
const browserFavicons = require('./browserFavicons')

const MAX_BOOKMARKS = 3000
const RELOAD_DEBOUNCE_MS = 600
const DEFAULT_BROWSER_KEY = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice'

const CHROMIUM_BROWSERS = [
  { match: 'chrome', base: 'LOCALAPPDATA', dir: ['Google', 'Chrome', 'User Data'] },
  { match: 'msedge', base: 'LOCALAPPDATA', dir: ['Microsoft', 'Edge', 'User Data'] },
  { match: 'brave', base: 'LOCALAPPDATA', dir: ['BraveSoftware', 'Brave-Browser', 'User Data'] },
  { match: 'vivaldi', base: 'LOCALAPPDATA', dir: ['Vivaldi', 'User Data'] },
  { match: 'opera', base: 'APPDATA', dir: ['Opera Software', 'Opera Stable'] },
]

let broadcast = null
let bookmarks = []
let loaded = false
let watcher = null
let reloadTimer = null

function getDefaultBrowserProgId() {
  return new Promise((resolve) => {
    execFile('reg', ['query', DEFAULT_BROWSER_KEY, '/v', 'ProgId'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null)
      const match = String(stdout).match(/ProgId\s+REG_SZ\s+(.+)/i)
      resolve(match ? match[1].trim() : null)
    })
  })
}

function resolveUserDataDir(progId) {
  if (!progId) return null
  const lower = progId.toLowerCase()
  for (const browser of CHROMIUM_BROWSERS) {
    if (!lower.includes(browser.match)) continue
    const base = process.env[browser.base]
    return base ? path.join(base, ...browser.dir) : null
  }
  return null
}

function resolveProfileDir(userDataDir) {
  try {
    const localState = JSON.parse(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8'))
    const lastUsed = localState && localState.profile && localState.profile.last_used
    if (lastUsed && fs.existsSync(path.join(userDataDir, lastUsed, 'Bookmarks'))) return lastUsed
  } catch {}
  return 'Default'
}

async function resolveBrowserPaths() {
  const progId = await getDefaultBrowserProgId()
  const userDataDir = resolveUserDataDir(progId)
  if (!userDataDir) return { bookmarks: null, favicons: null }
  const profileDir = path.join(userDataDir, resolveProfileDir(userDataDir))
  const bookmarksFile = path.join(profileDir, 'Bookmarks')
  const faviconsFile = path.join(profileDir, 'Favicons')
  return {
    bookmarks: fs.existsSync(bookmarksFile) ? bookmarksFile : null,
    favicons: fs.existsSync(faviconsFile) ? faviconsFile : null,
  }
}

function hostOf(url) {
  try { return new URL(url).hostname } catch { return '' }
}

function attachFavicons(list, faviconsFile) {
  if (!faviconsFile) return
  const neededHosts = new Set()
  for (const entry of list) {
    const host = hostOf(entry.url)
    if (host) neededHosts.add(host)
  }
  let iconByHost
  try { iconByHost = browserFavicons.readFaviconMap(faviconsFile, neededHosts) } catch { return }
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

function parseBookmarks(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
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

function publish() {
  if (broadcast) broadcast('bookmarks/changed', bookmarks)
}

function watch(file) {
  if (watcher) return
  try {
    watcher = fs.watch(path.dirname(file), (_event, filename) => {
      if (filename && filename !== 'Bookmarks') return
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
  const paths = await resolveBrowserPaths()
  if (!paths.bookmarks) {
    bookmarks = []
    publish()
    return
  }
  const list = parseBookmarks(paths.bookmarks)
  attachFavicons(list, paths.favicons)
  bookmarks = list
  publish()
  watch(paths.bookmarks)
}

async function ensureLoaded() {
  if (loaded) return
  loaded = true
  await reload()
}

module.exports = {
  handlers: {
    'bookmarks/list': async () => {
      await ensureLoaded()
      return bookmarks
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
  },
}

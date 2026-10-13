const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const appIcons = require('./appIcons')
const appxPackages = require('./appxPackages')
const plugins = require('./plugins')
const knownApps = require('../knownApps')
const { shellLinkInShortcut } = require('../launcherDeepLink')

const SCAN_DIRS = [
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
]

const START_APPS_REFRESH_MIN_GAP = 30000
const START_APPS_FALLBACK_REFRESH_INTERVAL = 1800000

let index = []
let startApps = []
let startAppsRefreshDebounce = null
let lastStartAppsRefresh = 0
let fallbackRefreshTimer = null
const shortcutInfoCache = new Map()
const lnkIconCache = new Map()
const startAppIconCache = new Map()
let broadcast = null

function knownAppDescription(target) {
  const known = knownApps[path.basename(String(target || '')).toLowerCase()]
  return known && known.category === 'app' ? known.blurb : undefined
}

function publishIndex() {
  if (!broadcast) return
  broadcast('apps/catalog-changed', index)
}

function walkShortcuts(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkShortcuts(full, out)
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase()
      if (lower.endsWith('.lnk') || lower.endsWith('.url')) out.push(full)
    }
  }
}

function readUrlShortcut(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const urlMatch = content.match(/^URL=(.+)$/m)
    if (!urlMatch) return null
    const iconMatch = content.match(/^IconFile=(.+)$/m)
    const indexMatch = content.match(/^IconIndex=(-?\d+)$/m)
    return {
      target: urlMatch[1].trim(),
      icon: iconMatch ? iconMatch[1].trim() : null,
      iconIndex: indexMatch ? parseInt(indexMatch[1], 10) : 0,
    }
  } catch {
    return null
  }
}

function getStartApps() {
  return new Promise((resolve) => {
    const script = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'
    execFile('powershell', ['-NoProfile', '-Command', script], { maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err) {
        console.error('[appCatalog] start apps discovery error:', err.message)
        return resolve([])
      }
      let parsed = []
      try { parsed = JSON.parse(stdout || '[]') } catch {}
      if (!Array.isArray(parsed)) parsed = [parsed]
      const apps = []
      for (const entry of parsed) {
        if (!entry || !entry.Name || !entry.AppID) continue
        const name = String(entry.Name).trim()
        const appId = String(entry.AppID).trim()
        if (name && appId) apps.push({ name, appId })
      }
      resolve(apps)
    })
  })
}

const BLOCKED_NAMES = new Set(['settings'])
const DOCUMENT_APPID_EXTS = new Set(['.txt', '.chm', '.hlp', '.pdf', '.html', '.htm', '.rtf', '.md', '.ini', '.log', '.url', '.website'])

function isDocumentAppId(appId) {
  if (!appId.includes('\\')) return false
  return DOCUMENT_APPID_EXTS.has(path.extname(appId).toLowerCase())
}

function readShortcutInfoCached(scPath, isUrl) {
  if (!isUrl) return appIcons.readShortcutLinkCached(scPath)
  const key = scPath.toLowerCase()
  let mtimeMs
  try { mtimeMs = fs.statSync(scPath).mtimeMs } catch { shortcutInfoCache.delete(key); return null }
  const cached = shortcutInfoCache.get(key)
  if (cached && cached.mtimeMs === mtimeMs) return cached.info
  const info = readUrlShortcut(scPath)
  shortcutInfoCache.set(key, { mtimeMs, info })
  return info
}

function dormantPluginFolders() {
  const folders = new Set()
  let records = []
  try {
    records = plugins.listPlugins()
  } catch (e) {
    console.error('[appCatalog] plugin folder lookup failed:', e && e.message)
    return folders
  }
  for (const record of records) {
    const contributed = (record.contributes && record.contributes.launcherFolders) || []
    if (!contributed.length) continue
    if (record.enabled !== false && record.loadable === true) continue
    for (const entry of contributed) folders.add(String(entry.startMenuFolder).toLowerCase())
  }
  return folders
}

function pluginFolderOwners() {
  const owners = new Map()
  let records = []
  try {
    records = plugins.listPlugins()
  } catch (e) {
    console.error('[appCatalog] plugin folder lookup failed:', e && e.message)
    return owners
  }
  for (const record of records) {
    if (record.enabled === false || record.loadable !== true) continue
    for (const entry of (record.contributes && record.contributes.launcherFolders) || []) {
      owners.set(String(entry.startMenuFolder).toLowerCase(), {
        pluginId: record.id,
        pluginName: record.name || record.id,
        badge: entry.badge ? `alpine-plugin://${record.id}/${entry.badge}` : null,
        uninstallCommand: entry.uninstallCommand || null,
      })
    }
  }
  return owners
}

function ownerForShortcut(scPath, owners) {
  if (owners.size === 0) return null
  for (const dir of SCAN_DIRS) {
    if (!dir) continue
    const relative = path.relative(dir, scPath)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue
    const segments = relative.split(path.sep)
    segments.pop()
    for (const segment of segments) {
      const owner = owners.get(segment.toLowerCase())
      if (owner) return owner
    }
  }
  return null
}

function isInDormantFolder(scPath, dormantFolders) {
  if (dormantFolders.size === 0) return false
  for (const dir of SCAN_DIRS) {
    if (!dir) continue
    const relative = path.relative(dir, scPath)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue
    const segments = relative.split(path.sep)
    segments.pop()
    if (segments.some((segment) => dormantFolders.has(segment.toLowerCase()))) return true
  }
  return false
}

function collectLnkItems() {
  const shortcutPaths = []
  for (const dir of SCAN_DIRS) walkShortcuts(dir, shortcutPaths)

  const dormantFolders = dormantPluginFolders()
  const owners = pluginFolderOwners()
  const seenNames = new Set()
  const items = []

  for (const scPath of shortcutPaths) {
    const name = path.basename(scPath, path.extname(scPath))
    const dedupeKey = name.toLowerCase()
    if (isInDormantFolder(scPath, dormantFolders)) {
      seenNames.add(dedupeKey)
      continue
    }

    const isUrl = scPath.toLowerCase().endsWith('.url')
    const info = readShortcutInfoCached(scPath, isUrl)
    if (!info?.target) continue
    if (info.target.toLowerCase().startsWith('ms-settings:')) continue

    if (BLOCKED_NAMES.has(dedupeKey)) continue
    if (seenNames.has(dedupeKey)) continue
    seenNames.add(dedupeKey)
    const owner = ownerForShortcut(scPath, owners)

    items.push({
      id: items.length,
      name,
      lnkPath: scPath,
      target: info.target,
      iconSource: info.icon && info.icon.length > 0 ? info.icon : (isUrl ? null : info.target),
      iconIndex: info.iconIndex || 0,
      icon: null,
      badge: owner ? owner.badge : null,
      owner,
      shellLink: shellLinkInShortcut(info),
      isUrl,
      description: knownAppDescription(info.target),
    })
  }

  return { items, seenNames }
}

function mergeStartAppsInto(items, seenNames, generic) {
  const newItems = []
  for (const startApp of startApps) {
    const dedupeKey = startApp.name.toLowerCase()
    if (BLOCKED_NAMES.has(dedupeKey)) continue
    if (startApp.appId.toLowerCase().startsWith('windows.immersivecontrolpanel')) continue
    if (isDocumentAppId(startApp.appId)) continue
    if (seenNames.has(dedupeKey)) continue
    seenNames.add(dedupeKey)
    const cachedIcon = startAppIconCache.get(startApp.appId.toLowerCase())
    const item = {
      id: 0,
      name: startApp.name,
      lnkPath: null,
      appId: startApp.appId,
      target: startApp.appId,
      icon: cachedIcon || generic,
    }
    items.push(item)
    newItems.push(item)
  }
  return newItems
}

async function resolveStartAppIcons(newItems) {
  const missing = newItems.filter((i) => !startAppIconCache.has(i.appId.toLowerCase()))
  if (missing.length === 0) return false
  const icons = await appIcons.resolveAppIcons(missing.map((i) => i.appId))
  for (let k = 0; k < missing.length; k++) {
    const url = icons[k] || null
    startAppIconCache.set(missing[k].appId.toLowerCase(), url)
    if (url) missing[k].icon = url
  }
  return true
}

function lnkIconIdentity(source, index) {
  let stamp = ''
  try {
    const stat = fs.statSync(appIcons.expandEnv(source))
    stamp = `${stat.mtimeMs}|${stat.size}`
  } catch { void 0 }
  return { key: `${source.toLowerCase()}|${index}`, stamp }
}

async function resolveLnkIcons(iconItems, generic) {
  const uncached = []
  for (const item of iconItems) {
    const identity = lnkIconIdentity(item.iconSource, item.iconIndex || 0)
    const cached = lnkIconCache.get(identity.key)
    if (cached && cached.stamp === identity.stamp) item.icon = cached.url || generic
    else uncached.push({ item, identity })
  }
  if (uncached.length === 0) return
  const icons = await appIcons.resolveIcons(uncached.map((u) => ({ path: u.item.iconSource, index: u.item.iconIndex || 0 })))
  for (let k = 0; k < uncached.length; k++) {
    const url = icons[k] || null
    lnkIconCache.set(uncached[k].identity.key, { stamp: uncached[k].identity.stamp, url })
    uncached[k].item.icon = url || generic
  }
}

async function buildIndex() {
  const { items, seenNames } = collectLnkItems()

  items.sort((a, b) => a.name.localeCompare(b.name))
  for (let i = 0; i < items.length; i++) items[i].id = i
  index = items
  publishIndex()

  const generic = await appIcons.ensureGenericIcon()

  const newStartAppItems = mergeStartAppsInto(items, seenNames, generic)
  if (newStartAppItems.length > 0) {
    items.sort((a, b) => a.name.localeCompare(b.name))
    for (let i = 0; i < items.length; i++) items[i].id = i
    index = items
    publishIndex()
    resolveStartAppIcons(newStartAppItems)
      .then((changed) => { if (changed) publishIndex() })
      .catch((e) => console.error('[appCatalog] start apps icon error:', e.message))
  }

  const iconItems = items.filter((i) => i.iconSource && i.iconSource.includes('\\'))
  await resolveLnkIcons(iconItems, generic)
  for (const item of items) if (!item.icon) item.icon = generic
  publishIndex()
}

async function refreshStartApps() {
  const apps = await getStartApps()
  if (apps.length > 0) startApps = apps
  await buildIndex()
}

let rebuildTimer = null
function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    buildIndex().catch((e) => console.error('[appCatalog] rebuild error:', e.message))
  }, 1000)
}

function scheduleStartAppsRefresh() {
  if (startAppsRefreshDebounce) clearTimeout(startAppsRefreshDebounce)
  startAppsRefreshDebounce = setTimeout(() => {
    startAppsRefreshDebounce = null
    lastStartAppsRefresh = Date.now()
    refreshStartApps().catch((e) => console.error('[appCatalog] start apps refresh error:', e.message))
  }, 1000)
}

function startFallbackStartAppsRefresh() {
  if (fallbackRefreshTimer) return
  fallbackRefreshTimer = setInterval(() => {
    refreshStartApps().catch((e) => console.error('[appCatalog] start apps refresh error:', e.message))
  }, START_APPS_FALLBACK_REFRESH_INTERVAL)
}

function onInstalledPackagesChanged() {
  const sinceLastRefresh = Date.now() - lastStartAppsRefresh
  if (startAppsRefreshDebounce) return
  if (sinceLastRefresh >= START_APPS_REFRESH_MIN_GAP) {
    scheduleStartAppsRefresh()
    return
  }
  startAppsRefreshDebounce = setTimeout(() => {
    startAppsRefreshDebounce = null
    scheduleStartAppsRefresh()
  }, START_APPS_REFRESH_MIN_GAP - sinceLastRefresh)
}

function watchScanDirs() {
  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue
    try {
      fs.watch(dir, { recursive: true }, scheduleRebuild)
    } catch (e) {
      console.error(`[appCatalog] watch error for ${dir}:`, e.message)
    }
  }
}

function findItem(id) {
  return index.find((i) => i.id === id)
}

module.exports = {
  handlers: {
    'launcher/index': () => index,
    'apps/catalog': () => index,
  },
  findItem,
  scheduleRebuild,
  scheduleStartAppsRefresh,
  start(b) {
    broadcast = b
    lastStartAppsRefresh = Date.now()
    refreshStartApps().catch((e) => console.error('[appCatalog] start apps error:', e.message))
    watchScanDirs()
    plugins.onPluginsChanged(scheduleRebuild)
    if (!appxPackages.watchPackages(onInstalledPackagesChanged, startFallbackStartAppsRefresh)) {
      console.error('[appCatalog] package watch unavailable, falling back to periodic start apps refresh')
      startFallbackStartAppsRefresh()
    }
  },
}

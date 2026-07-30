const { app, shell: electronShell, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile, exec } = require('child_process')
const { forceForeground, getForegroundWindow, minimizeWindow, maximizeWindow, closeWindow, insertText } = require('./winFocus')
const appIcons = require('./appIcons')
const appManager = require('./appManager')
const appActivator = require('../appActivator')
const { shellLinkInShortcut } = require('../launcherDeepLink')
const frecency = require('./frecency')
const plugins = require('./plugins')
const pluginBackendHost = require('../pluginBackendHost')
const notice = require('./shellNotice')

const PLUGIN_UNINSTALL_TIMEOUT_MS = 300000

const SCAN_DIRS = [
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
]

let index = []
let startApps = []
let startAppsRefreshDebounce = null
const shortcutInfoCache = new Map()
const lnkIconCache = new Map()
const startAppIconCache = new Map()
let broadcast = null
let shells = null
let activeDisplayId = null
let activeTopBar = null
let hideTimeout = null
let hideTimeoutTopBar = null
let lastUserForeground = 0
let switcherCloser = null
let emojiCaptureControl = null
let shellLinkOpener = null
const lastPanelBottom = new Map()

function applyPanelBounds(topBar, displayId) {
  const bottom = lastPanelBottom.get(displayId)
  if (bottom && typeof topBar.setRaisedBounds === 'function') topBar.setRaisedBounds(bottom)
}

function setEmojiCapture(active, hwnd) {
  if (emojiCaptureControl) {
    try { emojiCaptureControl(active, hwnd) } catch (e) { console.error('[launcher] emoji capture error:', e.message) }
  }
}

const LAUNCHER_WIDTH = 600
const START_APPS_REFRESH_INTERVAL = 1800000

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
        console.error('[launcher] start apps discovery error:', err.message)
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
  const key = scPath.toLowerCase()
  let mtimeMs
  try { mtimeMs = fs.statSync(scPath).mtimeMs } catch { shortcutInfoCache.delete(key); return null }
  const cached = shortcutInfoCache.get(key)
  if (cached && cached.mtimeMs === mtimeMs) return cached.info
  let info
  if (isUrl) info = readUrlShortcut(scPath)
  else { try { info = electronShell.readShortcutLink(scPath) } catch { info = null } }
  shortcutInfoCache.set(key, { mtimeMs, info })
  return info
}

function dormantPluginFolders() {
  const folders = new Set()
  let records = []
  try {
    records = plugins.listPlugins()
  } catch (e) {
    console.error('[launcher] plugin folder lookup failed:', e && e.message)
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
    console.error('[launcher] plugin folder lookup failed:', e && e.message)
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

function lnkIconCacheKey(source, index) {
  let mtimeMs = 0
  try { mtimeMs = fs.statSync(appIcons.expandEnv(source)).mtimeMs } catch {}
  return `${source.toLowerCase()}|${index}|${mtimeMs}`
}

async function resolveLnkIcons(iconItems, generic) {
  const uncached = []
  for (const item of iconItems) {
    const key = lnkIconCacheKey(item.iconSource, item.iconIndex || 0)
    if (lnkIconCache.has(key)) item.icon = lnkIconCache.get(key) || generic
    else uncached.push({ item, key })
  }
  if (uncached.length === 0) return
  const icons = await appIcons.resolveIcons(uncached.map((u) => ({ path: u.item.iconSource, index: u.item.iconIndex || 0 })))
  for (let k = 0; k < uncached.length; k++) {
    const url = icons[k] || null
    lnkIconCache.set(uncached[k].key, url)
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
      .catch((e) => console.error('[launcher] start apps icon error:', e.message))
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
    buildIndex().catch((e) => console.error('[launcher] rebuild error:', e.message))
  }, 1000)
}

function scheduleStartAppsRefresh() {
  if (startAppsRefreshDebounce) clearTimeout(startAppsRefreshDebounce)
  startAppsRefreshDebounce = setTimeout(() => {
    startAppsRefreshDebounce = null
    refreshStartApps().catch((e) => console.error('[launcher] start apps refresh error:', e.message))
  }, 1000)
}

function watchScanDirs() {
  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue
    try {
      fs.watch(dir, { recursive: true }, scheduleRebuild)
    } catch (e) {
      console.error(`[launcher] watch error for ${dir}:`, e.message)
    }
  }
}

function setShells(s) {
  shells = s
}

function isLauncherActive(win) {
  return activeTopBar === win
}

function getActiveDisplayId() {
  return activeTopBar ? activeDisplayId : null
}

function isOwnShellWindow(hwnd) {
  if (!shells) return false
  for (const shell of shells.values()) {
    for (const win of [shell.topBar, shell.desktop]) {
      try {
        if (win && !win.isDestroyed() && win.getNativeWindowHandle().readUInt32LE(0) === hwnd) return true
      } catch {}
    }
  }
  return false
}

function finishHide(topBar) {
  if (topBar.isDestroyed()) return
  topBar.webContents.send('launcher/hide')
  topBar.setFocusable(false)
  if (typeof topBar.restorePassiveTopBar === 'function') topBar.restorePassiveTopBar()
  else topBar.setAlwaysOnTop(false)
}

function endEmojiCapture() {
  setEmojiCapture(false)
}

function flushPendingHide(keepTopBar) {
  if (!hideTimeout) return
  clearTimeout(hideTimeout)
  hideTimeout = null
  const topBar = hideTimeoutTopBar
  hideTimeoutTopBar = null
  if (topBar && topBar !== keepTopBar) finishHide(topBar)
}

function animatedHide() {
  if (!activeTopBar || activeTopBar.isDestroyed()) return
  endEmojiCapture()
  activeTopBar.webContents.send('launcher/start-close')
  const topBar = activeTopBar
  activeTopBar = null
  activeDisplayId = null
  flushPendingHide(topBar)
  hideTimeoutTopBar = topBar
  hideTimeout = setTimeout(() => {
    hideTimeout = null
    hideTimeoutTopBar = null
    finishHide(topBar)
  }, 300)
}

function hideForOverlay() {
  endEmojiCapture()
  if (!activeTopBar || activeTopBar.isDestroyed()) {
    activeTopBar = null
    activeDisplayId = null
    return
  }
  const topBar = activeTopBar
  activeTopBar = null
  activeDisplayId = null
  flushPendingHide()
  finishHide(topBar)
}

function setSwitcherCloser(fn) {
  switcherCloser = typeof fn === 'function' ? fn : null
}

function showLauncher(displayId, mode) {
  if (!shells) return
  const shell = shells.get(displayId)
  if (!shell || shell.topBar.isDestroyed()) return
  const topBar = shell.topBar

  endEmojiCapture()

  try {
    const fg = getForegroundWindow()
    if (fg && !isOwnShellWindow(fg)) lastUserForeground = fg
  } catch {}

  flushPendingHide(topBar)

  if (activeTopBar && activeTopBar !== topBar) {
    const previousTopBar = activeTopBar
    activeTopBar = null
    finishHide(previousTopBar)
  }

  if (switcherCloser) {
    try { switcherCloser() } catch (e) { console.error('[launcher] switcher close error:', e.message) }
  }

  topBar.webContents.send('topbar/close-menus')
  topBar.setFocusable(true)
  topBar.setIgnoreMouseEvents(false)
  applyPanelBounds(topBar, displayId)
  topBar.setAlwaysOnTop(true, 'screen-saver')

  topBar.webContents.send('launcher/show', { displayId, mode: mode || 'apps' })
  try {
    const hwnd = topBar.getNativeWindowHandle().readUInt32LE(0)
    forceForeground(hwnd)
  } catch (e) {
    console.error('[launcher] forceForeground error:', e.message)
  }
  topBar.focus()

  activeDisplayId = displayId
  activeTopBar = topBar
}

function showFromHotkey() {
  if (activeTopBar) {
    animatedHide()
    return
  }
  const { screen } = require('electron')
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  showLauncher(display.id)
}

function showEmoji() {
  if (activeTopBar) {
    animatedHide()
    return
  }
  if (!shells) return
  const { screen } = require('electron')
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const shell = shells.get(display.id)
  if (!shell || shell.topBar.isDestroyed()) return
  const topBar = shell.topBar

  let target = 0
  try {
    const fg = getForegroundWindow()
    if (fg && !isOwnShellWindow(fg)) { lastUserForeground = fg; target = fg }
  } catch {}

  flushPendingHide(topBar)

  if (switcherCloser) {
    try { switcherCloser() } catch (e) { console.error('[launcher] switcher close error:', e.message) }
  }

  topBar.webContents.send('topbar/close-menus')
  topBar.setIgnoreMouseEvents(false)
  applyPanelBounds(topBar, display.id)
  topBar.setAlwaysOnTop(true, 'screen-saver')
  topBar.webContents.send('launcher/show', { displayId: display.id, mode: 'emoji', capture: true })

  activeDisplayId = display.id
  activeTopBar = topBar
  setEmojiCapture(true, target)
}

function forwardEmojiKey(message) {
  if (!activeTopBar || activeTopBar.isDestroyed()) return
  activeTopBar.webContents.send('emoji/key', message)
}

function setEmojiCaptureControl(fn) {
  emojiCaptureControl = typeof fn === 'function' ? fn : null
}

function setShellLinkOpener(fn) {
  shellLinkOpener = typeof fn === 'function' ? fn : null
}

function handleBlur(topBar) {
  if (activeTopBar !== topBar) return
  animatedHide()
}

function findItem(id) {
  return index.find((i) => i.id === id)
}

function launchItem(item) {
  if (!item) return { success: false }
  if (item.shellLink && shellLinkOpener) {
    shellLinkOpener(item.shellLink)
    frecency.record(item.target)
    return { success: true }
  }
  if (item.lnkPath) {
    electronShell.openPath(item.lnkPath).then((err) => {
      if (err) {
        console.error('[launcher] openPath failed for', item.lnkPath, '-', err)
        execFile('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${item.lnkPath.replace(/'/g, "''")}'`], { windowsHide: true }, (e) => {
          if (e) console.error('[launcher] start-process fallback error:', e.message)
        })
      }
    })
  } else if (item.appId) {
    appActivator.activate(item.appId)
  }
  frecency.record(item.target)
  return { success: true }
}

function launchAdminItem(item) {
  if (!item) return { success: false }
  if (item.shellLink) return launchItem(item)
  if (item.lnkPath) {
    exec(`powershell -NoProfile -Command "Start-Process '${item.lnkPath.replace(/'/g, "''")}' -Verb RunAs"`, { windowsHide: true })
  } else if (item.appId) {
    appActivator.activate(item.appId)
  }
  frecency.record(item.target)
  return { success: true }
}

async function uninstallByOwningPlugin(item) {
  const owner = item.owner
  const reply = await pluginBackendHost.sendCommand(
    owner.pluginId,
    owner.uninstallCommand,
    { file: item.lnkPath, name: item.name },
    { timeoutMs: PLUGIN_UNINSTALL_TIMEOUT_MS },
  )
  const value = reply.ok && reply.value && typeof reply.value === 'object' ? reply.value : {}
  const removed = reply.ok && value.ok !== false
  notice.show({
    id: 'launcher-uninstall',
    title: owner.pluginName,
    message: value.message || (removed ? `${item.name} was removed.` : `${item.name} could not be removed: ${reply.error || 'the plugin refused'}`),
    tone: removed ? 'success' : 'error',
    pill: removed,
    timeoutMs: removed ? 7000 : 0,
  })
  if (removed) scheduleRebuild()
  return { ok: removed, mode: 'plugin' }
}

async function uninstallItem(item) {
  if (!item) return { ok: false, mode: 'none' }
  if (item.owner && item.owner.uninstallCommand) return uninstallByOwningPlugin(item)
  const result = await appManager.uninstallByLaunch({ appId: item.appId, target: item.target, name: item.name })
  scheduleStartAppsRefresh()
  return result
}

function openItemLocation(item) {
  if (!item || !item.lnkPath) return { success: false }
  electronShell.showItemInFolder(item.lnkPath)
  return { success: true }
}

module.exports = {
  handlers: {
    'launcher/index': () => index,
    'launcher/show': (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const { screen } = require('electron')
      const display = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()
      showLauncher(display.id)
    },
    'launcher/hide': () => animatedHide(),
    'launcher/panel-bottom': (event, bottom) => {
      if (!activeTopBar || activeTopBar.isDestroyed()) return
      if (event.sender !== activeTopBar.webContents) return
      if (typeof bottom !== 'number' || !Number.isFinite(bottom) || bottom <= 0) return
      lastPanelBottom.set(activeDisplayId, bottom)
      if (typeof activeTopBar.setRaisedBounds === 'function') activeTopBar.setRaisedBounds(bottom)
    },
    'launcher/launch': (_event, id) => {
      const item = findItem(id)
      if (!item) return { success: false }
      animatedHide()
      return launchItem(item)
    },
    'launcher/launch-admin': (_event, id) => {
      const item = findItem(id)
      if (!item) return { success: false }
      animatedHide()
      return launchAdminItem(item)
    },
    'launcher/uninstall': (_event, id) => {
      const item = findItem(id)
      if (!item) return Promise.resolve({ ok: false, mode: 'none' })
      return uninstallItem(item)
    },
    'launcher/close-window': (_event, hwnd) => {
      animatedHide()
      exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate([int]0); Add-Type -Name W -Namespace W -MemberDefinition '[DllImport(\\\"user32.dll\\\")] public static extern int PostMessage(IntPtr h,uint m,int w,int l);'; [W.W]::PostMessage([IntPtr]${hwnd}, 0x0010, 0, 0)"`, { windowsHide: true })
      return { success: true }
    },
    'launcher/end-task': (_event, pid) => {
      animatedHide()
      try { process.kill(pid) } catch {}
      return { success: true }
    },
    'launcher/open-location': (_event, id) => openItemLocation(findItem(id)),
    'launcher/insert-text': async (_event, text) => {
      const hwnd = lastUserForeground
      hideForOverlay()
      if (typeof text !== 'string' || !text) return { ok: false }
      return { ok: await insertText(hwnd, text) }
    },
    'apps/catalog': () => index,
    'apps/window-command': (_event, action) => {
      const hwnd = lastUserForeground
      animatedHide()
      if (!hwnd) return { ok: false }
      if (action === 'minimize') minimizeWindow(hwnd)
      else if (action === 'maximize') maximizeWindow(hwnd)
      else if (action === 'close') closeWindow(hwnd)
      else return { ok: false }
      return { ok: true }
    },
    'apps/launch': (_event, id) => launchItem(findItem(id)),
    'apps/launch-admin': (_event, id) => launchAdminItem(findItem(id)),
    'apps/app-open-location': (_event, id) => openItemLocation(findItem(id)),
    'apps/app-uninstall': (_event, id) => uninstallItem(findItem(id)),
  },
  setShells,
  showFromHotkey,
  showEmoji,
  forwardEmojiKey,
  setEmojiCaptureControl,
  setShellLinkOpener,
  closeEmoji: animatedHide,
  hideForOverlay,
  setSwitcherCloser,
  getActiveDisplayId,
  isLauncherActive,
  handleBlur,
  start(b) {
    broadcast = b
    appActivator.warm()
    refreshStartApps().catch((e) => console.error('[launcher] start apps error:', e.message))
    watchScanDirs()
    plugins.onPluginsChanged(scheduleRebuild)
    setInterval(() => {
      refreshStartApps().catch((e) => console.error('[launcher] start apps refresh error:', e.message))
    }, START_APPS_REFRESH_INTERVAL)
  },
}

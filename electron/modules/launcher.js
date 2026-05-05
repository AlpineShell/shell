const { app, shell: electronShell, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const SCAN_DIRS = [
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
]

const SKIP_NAMES = new Set([
  'uninstall', 'uninstaller', 'readme', 'license', 'help', 'documentation',
])

let index = []
let broadcast = null
let launcherWindow = null
let shells = null
let activeDisplayId = null

const LAUNCHER_WINDOW_WIDTH = 624

function broadcastGap(displayId, gap) {
  if (!shells) return
  const shell = shells.get(displayId)
  if (!shell || shell.topBar.isDestroyed()) return
  shell.topBar.webContents.send('topbar/launcher-gap', { open: gap !== null, gap })
}

function shouldSkipShortcut(file) {
  const lower = file.toLowerCase().replace(/\.lnk$/, '')
  for (const skip of SKIP_NAMES) {
    if (lower.includes(skip)) return true
  }
  return false
}

function walkLnks(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkLnks(full, out)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
      if (shouldSkipShortcut(entry.name)) continue
      out.push(full)
    }
  }
}

async function buildIndex() {
  const lnkPaths = []
  for (const dir of SCAN_DIRS) walkLnks(dir, lnkPaths)

  const seenNames = new Set()
  const items = []

  for (const lnkPath of lnkPaths) {
    let info
    try { info = electronShell.readShortcutLink(lnkPath) } catch { continue }
    if (!info?.target) continue

    const targetLower = info.target.toLowerCase()
    if (!targetLower.endsWith('.exe') && !info.appUserModelId) continue

    const name = path.basename(lnkPath, '.lnk')
    const dedupeKey = name.toLowerCase()
    if (seenNames.has(dedupeKey)) continue
    seenNames.add(dedupeKey)

    let icon = null
    try {
      const img = await app.getFileIcon(lnkPath, { size: 'normal' })
      if (img && !img.isEmpty()) icon = img.toDataURL()
    } catch {}

    items.push({
      id: items.length,
      name,
      lnkPath,
      target: info.target,
      icon,
    })
  }

  items.sort((a, b) => a.name.localeCompare(b.name))
  for (let i = 0; i < items.length; i++) items[i].id = i
  index = items
  if (broadcast) broadcast('launcher/index-changed', index)
}

let rebuildTimer = null
function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    buildIndex().catch((e) => console.error('[launcher] rebuild error:', e.message))
  }, 1000)
}

function watchScanDirs() {
  for (const dir of SCAN_DIRS) {
    try {
      fs.watch(dir, { recursive: true }, scheduleRebuild)
    } catch (e) {
      console.error(`[launcher] watch error for ${dir}:`, e.message)
    }
  }
}

function setLauncherWindow(win) {
  launcherWindow = win
  win.on('blur', () => animatedHide())
}

function setShells(s) {
  shells = s
}

function animatedHide() {
  if (!launcherWindow || launcherWindow.isDestroyed()) return
  if (!launcherWindow.isVisible()) return
  if (activeDisplayId != null) {
    broadcastGap(activeDisplayId, null)
    activeDisplayId = null
  }
  launcherWindow.webContents.send('launcher/start-close')
  setTimeout(() => {
    if (!launcherWindow.isDestroyed() && !launcherWindow.isFocused()) {
      launcherWindow.webContents.send('launcher/hide')
      launcherWindow.hide()
    }
  }, 110)
}

function showLauncher(displayId) {
  if (!launcherWindow || launcherWindow.isDestroyed()) return
  const { screen } = require('electron')
  const display = screen.getAllDisplays().find((d) => d.id === displayId) || screen.getPrimaryDisplay()
  const width = LAUNCHER_WINDOW_WIDTH
  const height = 600
  const x = Math.round(display.bounds.x + (display.bounds.width - width) / 2)
  const y = display.bounds.y + 24
  launcherWindow.setBounds({ x, y, width, height })
  launcherWindow.webContents.send('launcher/show', { displayId })
  launcherWindow.showInactive()
  launcherWindow.setAlwaysOnTop(true, 'screen-saver')
  launcherWindow.focus()

  if (activeDisplayId != null && activeDisplayId !== displayId) {
    broadcastGap(activeDisplayId, null)
  }
  activeDisplayId = displayId
  const gapLeft = Math.round((display.bounds.width - width) / 2)
  const gapRight = gapLeft + width
  broadcastGap(displayId, { left: gapLeft, right: gapRight })
}

function showFromHotkey() {
  const { screen } = require('electron')
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  showLauncher(display.id)
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
    'launcher/launch': (_event, id) => {
      const item = index.find((i) => i.id === id)
      if (!item) return { success: false }
      animatedHide()
      electronShell.openPath(item.lnkPath).catch((e) => console.error('[launcher] launch error:', e.message))
      return { success: true }
    },
  },
  setLauncherWindow,
  setShells,
  showFromHotkey,
  start(b) {
    broadcast = b
    buildIndex().catch((e) => console.error('[launcher] initial index error:', e.message))
    watchScanDirs()
  },
}

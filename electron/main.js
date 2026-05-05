const { app, BrowserWindow, screen, ipcMain } = require('electron')
const path = require('path')
const ipc = require('./ipc')
const wallpaper = require('./modules/wallpaper')
const network = require('./modules/network')
const bluetooth = require('./modules/bluetooth')
const openApps = require('./modules/openApps')
const topbarColor = require('./modules/topbarColor')
const foregroundColor = require('./modules/foregroundColor')
const volume = require('./modules/volume')
const brightness = require('./modules/brightness')
const power = require('./modules/power')
const setup = require('./modules/setup')
const mediaSession = require('./modules/mediaSession')
const microphone = require('./modules/microphone')
const battery = require('./modules/battery')
const launcher = require('./modules/launcher')
let altTab = null
try { altTab = require('./modules/altTab') } catch (e) { console.error('[main] altTab load error:', e.message) }
let screenshot = null
try { screenshot = require('./modules/screenshot') } catch (e) { console.error('[main] screenshot load error:', e.message) }
const { processAutostart } = require('./modules/autostart')
const installer = require('./modules/installer')
const {
  registerAppBar,
  unregisterAppBar,
  unregisterAll,
  isSettingWorkArea,
} = require('./modules/appbar')

const isDev = !app.isPackaged
const BASE_URL = isDev ? 'http://localhost:5173' : null

function getURL(mode, displayId) {
  const params = displayId != null ? `mode=${mode}&displayId=${displayId}` : `mode=${mode}`
  if (isDev) return `${BASE_URL}?${params}`
  return `file://${path.join(__dirname, '..', 'dist', 'index.html')}?${params}`
}
const TOP_BAR_HEIGHT = 24

const shells = new Map()

function createDesktopWindow(display) {
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x, y, width, height,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    transparent: false,
    roundedCorners: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setAlwaysOnTop(false)
  win.loadURL(getURL('desktop'))

  return win
}

function forceShellBounds(shell) {
  if (!shell) return
  const { x, y, width, height } = shell.display.bounds
  if (!shell.desktop.isDestroyed()) shell.desktop.setBounds({ x, y, width, height })
  if (!shell.topBar.isDestroyed()) shell.topBar.setBounds({ x, y, width, height: TOP_BAR_HEIGHT })
}

function createTopBarWindow(display) {
  const { x, y, width } = display.bounds

  const win = new BrowserWindow({
    x, y, width,
    height: TOP_BAR_HEIGHT,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    transparent: true,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setAlwaysOnTop(false)
  win.setIgnoreMouseEvents(true)
  win.loadURL(getURL('topbar', display.id))

  const INTERACTIVE_RIGHT = 400
  const INTERACTIVE_LEFT = 40
  const INTERACTIVE_CENTER = 120
  let ignoring = true

  const cursorTracker = setInterval(() => {
    if (win.isDestroyed()) return
    const bounds = win.getBounds()
    const cursor = screen.getCursorScreenPoint()

    const isExpanded = bounds.height > TOP_BAR_HEIGHT
    const inBounds = cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height &&
                     cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width
    const inLeftZone = cursor.x < bounds.x + INTERACTIVE_LEFT
    const inRightZone = cursor.x >= bounds.x + bounds.width - INTERACTIVE_RIGHT
    const centerX = bounds.x + bounds.width / 2
    const inCenterZone = cursor.x >= centerX - INTERACTIVE_CENTER / 2 && cursor.x < centerX + INTERACTIVE_CENTER / 2
    const inInteractive = inBounds &&
      (isExpanded || inLeftZone || inRightZone || inCenterZone)

    if (inInteractive && ignoring) {
      ignoring = false
      win.setIgnoreMouseEvents(false)
    } else if (!inInteractive && !ignoring) {
      ignoring = true
      win.setIgnoreMouseEvents(true)
      if (isExpanded) {
        win.webContents.send('topbar/close-menus')
      }
    }
  }, 50)

  const onSetHeight = (event, height) => {
    if (win.isDestroyed()) return
    if (event.sender === win.webContents) {
      const bounds = win.getBounds()
      win.setBounds({ ...bounds, height })
      win.setAlwaysOnTop(height > TOP_BAR_HEIGHT)
    }
  }
  ipcMain.on('topbar/set-height', onSetHeight)
  win.on('closed', () => {
    clearInterval(cursorTracker)
    ipcMain.removeListener('topbar/set-height', onSetHeight)
  })

  win.webContents.once('did-finish-load', () => {
    try {
      registerAppBar(win, display, TOP_BAR_HEIGHT)
    } catch (err) {
      console.error(`[main] Failed to register appbar on display ${display.id}:`, err)
    }

    setTimeout(() => {
      const shell = [...shells.values()].find(s => s.topBar === win)
      if (shell) forceShellBounds(shell)
    }, 300)
  })

  return win
}

function createShellForDisplay(display) {
  console.log(`[main] Creating shell for display ${display.id}: ${display.bounds.width}x${display.bounds.height} @ ${display.scaleFactor}x DPI`)

  const desktop = createDesktopWindow(display)
  const topBar = createTopBarWindow(display)

  shells.set(display.id, { desktop, topBar, display })
  return { desktop, topBar }
}

function destroyShellForDisplay(displayId) {
  const shell = shells.get(displayId)
  if (!shell) return

  console.log(`[main] Destroying shell for display ${displayId}`)

  try { unregisterAppBar(shell.topBar) } catch (e) { /* ignore */ }
  if (!shell.topBar.isDestroyed()) shell.topBar.destroy()
  if (!shell.desktop.isDestroyed()) shell.desktop.destroy()

  shells.delete(displayId)
}

function repositionShell(display) {
  const shell = shells.get(display.id)
  if (!shell) return

  console.log(`[main] Repositioning shell for display ${display.id}: ${display.bounds.width}x${display.bounds.height} @ ${display.scaleFactor}x DPI`)

  const { x, y, width, height } = display.bounds

  shell.desktop.setBounds({ x, y, width, height })
  shell.topBar.setBounds({ x, y, width, height: TOP_BAR_HEIGHT })

  try {
    unregisterAppBar(shell.topBar)
    registerAppBar(shell.topBar, display, TOP_BAR_HEIGHT)
  } catch (err) {
    console.error(`[main] Failed to re-register appbar on display ${display.id}:`, err)
  }

  setTimeout(() => forceShellBounds(shell), 300)

  shell.display = display
}

function createAltTabWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    transparent: true,
    thickFrame: false,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.loadURL(getURL('alttab'))

  win.webContents.once('did-finish-load', () => {
    win.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
    win.showInactive()
  })

  return win
}

function createScreenshotWindow() {
  const win = new BrowserWindow({
    width: 1,
    height: 1,
    x: -10000,
    y: -10000,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    transparent: true,
    thickFrame: false,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.loadURL(getURL('screenshot'))

  win.webContents.once('did-finish-load', () => {
    win.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
  })

  return win
}

function createLauncherWindow() {
  const win = new BrowserWindow({
    width: 624,
    height: 600,
    x: -10000,
    y: -10000,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    transparent: true,
    thickFrame: false,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.loadURL(getURL('launcher'))

  return win
}

function createSetupWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 560,
    frame: false,
    resizable: false,
    center: true,
    transparent: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadURL(getURL('setup'))

  win.on('closed', () => {
    app.quit()
  })

  return win
}

let settingsWin = null
function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return settingsWin
  }
  settingsWin = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 680,
    minHeight: 480,
    frame: false,
    resizable: true,
    center: true,
    transparent: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  settingsWin.loadURL(getURL('settings'))
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  return settingsWin
}

ipcMain.handle('windows/open-settings', () => {
  createSettingsWindow()
})

app.whenReady().then(async () => {
  if (process.argv.includes('--uninstall')) {
    installer.uninstall()
    app.quit()
    return
  }

  ipc.register(wallpaper, network, bluetooth, openApps, topbarColor, foregroundColor, volume, brightness, power, altTab, setup, mediaSession, microphone, battery, screenshot, launcher)

  if (process.argv.includes('--setup')) {
    createSetupWindow()
    return
  }

  if (!isDev && installer.isPortableRun()) {
    createSetupWindow()
    return
  }

  if (!isDev && setup.isFirstRun()) {
    createSetupWindow()
    return
  }

  const altTabWindow = createAltTabWindow()
  altTab.setOverlayWindow(altTabWindow)
  altTab.setShells(shells)

  const screenshotWindow = createScreenshotWindow()
  if (screenshot) {
    screenshot.setOverlayWindow(screenshotWindow)
    altTab.onScreenshot(
      () => screenshot.showOverlay(),
      () => screenshot.hideOverlay()
    )
  }

  const launcherWindow = createLauncherWindow()
  launcher.setLauncherWindow(launcherWindow)
  launcher.setShells(shells)

  for (const display of screen.getAllDisplays()) {
    createShellForDisplay(display)
  }

  if (!isDev) processAutostart()

  screen.on('display-added', (_event, newDisplay) => {
    console.log(`[main] Display added: ${newDisplay.id}`)
    createShellForDisplay(newDisplay)
  })

  screen.on('display-removed', (_event, oldDisplay) => {
    console.log(`[main] Display removed: ${oldDisplay.id}`)
    destroyShellForDisplay(oldDisplay.id)
  })

  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    if (isSettingWorkArea()) return

    if (changedMetrics.length === 1 && changedMetrics[0] === 'workArea') {
      const shell = shells.get(display.id)
      if (shell) forceShellBounds(shell)
      return
    }

    console.log(`[main] Display metrics changed: ${display.id} [${changedMetrics.join(', ')}]`)
    if (changedMetrics.includes('bounds') || changedMetrics.includes('scaleFactor')) {
      repositionShell(display)
    }
  })
})

app.on('will-quit', () => {
  unregisterAll()
})

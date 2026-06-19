const { app, BrowserWindow, screen, ipcMain, protocol, net } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

protocol.registerSchemesAsPrivileged([
  { scheme: 'alpine-wallpaper', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } },
])
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
const systemInfo = require('./modules/systemInfo')
const launcher = require('./modules/launcher')
const runCommand = require('./modules/runCommand')
const launcherHotkey = require('./modules/launcherHotkey')
const trayLayout = require('./modules/trayLayout')
const appManager = require('./modules/appManager')
const tiling = require('./modules/tiling')
const appActivator = require('./appActivator')
let trayHost = null
try { trayHost = require('./modules/trayHost') } catch (e) { console.error('[main] trayHost load error:', e.message) }
let altTab = null
try { altTab = require('./modules/altTab') } catch (e) { console.error('[main] altTab load error:', e.message) }
let screenshot = null
try { screenshot = require('./modules/screenshot') } catch (e) { console.error('[main] screenshot load error:', e.message) }
let powerThrottling = null
try { powerThrottling = require('./modules/powerThrottling') } catch (e) { console.error('[main] powerThrottling load error:', e.message) }
let shellWindow = null
try { shellWindow = require('./modules/shellWindow') } catch (e) { console.error('[main] shellWindow load error:', e.message) }
const { processAutostart } = require('./modules/autostart')
const installer = require('./modules/installer')
const updater = require('./modules/updater')
const windowsUpdate = require('./modules/windowsUpdate')
const {
  registerAppBar,
  unregisterAppBar,
  unregisterAll,
  isSettingWorkArea,
} = require('./modules/appbar')

const isDev = !app.isPackaged
const BASE_URL = isDev ? 'http://127.0.0.1:5173' : null
const shouldTakeOverExplorer = !isDev || process.env.ALPINE_KILL_EXPLORER === '1'
let killedExplorer = false

app.commandLine.appendSwitch('disable-features', 'NetworkServiceSandbox,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

function getURL(mode, displayId) {
  const params = displayId != null ? `mode=${mode}&displayId=${displayId}` : `mode=${mode}`
  if (isDev) return `${BASE_URL}?${params}`
  return `file://${path.join(__dirname, '..', 'dist', 'index.html')}?${params}`
}

function loadAppURL(win, url) {
  win.loadURL(url)
  let attempts = 0
  win.webContents.on('did-finish-load', () => { attempts = 0 })
  win.webContents.on('did-fail-load', (_event, errorCode, _desc, _validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || attempts >= 30) return
    attempts++
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL(url) }, Math.min(2000, 400 + attempts * 200))
  })
  win.webContents.on('render-process-gone', () => {
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL(url) }, 600)
  })
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
    backgroundColor: '#1a1a2e',
    roundedCorners: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(false)
  loadAppURL(win, getURL('desktop'))

  return win
}

function forceShellBounds(shell) {
  if (!shell) return
  const { x, y, width, height } = shell.display.bounds
  if (!shell.desktop.isDestroyed()) shell.desktop.setBounds({ x, y, width, height })
  if (!shell.topBar.isDestroyed()) shell.topBar.setBounds({ x, y, width, height })
}

function createTopBarWindow(display) {
  const { x, y, width } = display.bounds

  const win = new BrowserWindow({
    x, y, width,
    height: display.bounds.height,
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
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(false)
  win.setIgnoreMouseEvents(true)
  loadAppURL(win, getURL('topbar', display.id))

  const INTERACTIVE_RIGHT = 600
  const INTERACTIVE_LEFT = 40
  const INTERACTIVE_CENTER = 120
  let ignoring = true
  let activeRegion = null

  function evaluateCursorInteraction() {
    if (win.isDestroyed()) return
    if (launcher.isLauncherActive(win)) return
    if (altTab && altTab.isAltTabActive(win)) return
    const bounds = win.getBounds()
    const cursor = screen.getCursorScreenPoint()

    const inBarRow = cursor.y >= bounds.y && cursor.y < bounds.y + TOP_BAR_HEIGHT &&
                     cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width
    const inLeftZone = cursor.x < bounds.x + INTERACTIVE_LEFT
    const inRightZone = cursor.x >= bounds.x + bounds.width - INTERACTIVE_RIGHT
    const centerX = bounds.x + bounds.width / 2
    const inCenterZone = cursor.x >= centerX - INTERACTIVE_CENTER / 2 && cursor.x < centerX + INTERACTIVE_CENTER / 2

    let inInteractive
    if (activeRegion) {
      const inMenu = cursor.y >= bounds.y + activeRegion.top && cursor.y < bounds.y + activeRegion.bottom &&
                     cursor.x >= bounds.x + activeRegion.left && cursor.x < bounds.x + activeRegion.right
      inInteractive = inBarRow || inMenu
    } else {
      inInteractive = inBarRow && (inLeftZone || inRightZone || inCenterZone)
    }

    if (inInteractive && ignoring) {
      ignoring = false
      win.setIgnoreMouseEvents(false)
    } else if (!inInteractive && !ignoring) {
      ignoring = true
      win.setIgnoreMouseEvents(true)
      if (activeRegion) {
        win.webContents.send('topbar/close-menus')
      }
    }
  }

  win.restorePassiveTopBar = () => {
    if (win.isDestroyed()) return
    if (launcher.isLauncherActive(win)) return
    if (altTab && altTab.isAltTabActive(win)) return
    activeRegion = null
    win.setAlwaysOnTop(false)
    ignoring = true
    win.setIgnoreMouseEvents(true)
    evaluateCursorInteraction()
  }

  const cursorTracker = setInterval(evaluateCursorInteraction, 50)

  const onSetActiveRegion = (event, region) => {
    if (win.isDestroyed()) return
    if (launcher.isLauncherActive(win)) return
    if (altTab && altTab.isAltTabActive(win)) return
    if (event.sender !== win.webContents) return
    if (region) {
      activeRegion = region
      win.setAlwaysOnTop(true, 'screen-saver')
    } else {
      activeRegion = null
      win.setAlwaysOnTop(false)
    }
    evaluateCursorInteraction()
  }
  ipcMain.on('topbar/set-active-region', onSetActiveRegion)

  win.on('blur', () => launcher.handleBlur(win))
  win.on('closed', () => {
    clearInterval(cursorTracker)
    ipcMain.removeListener('topbar/set-active-region', onSetActiveRegion)
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
  shell.topBar.setBounds({ x, y, width, height })

  try {
    unregisterAppBar(shell.topBar)
    registerAppBar(shell.topBar, display, TOP_BAR_HEIGHT)
  } catch (err) {
    console.error(`[main] Failed to re-register appbar on display ${display.id}:`, err)
  }

  setTimeout(() => forceShellBounds(shell), 300)

  shell.display = display
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
  loadAppURL(win, getURL('screenshot'))

  win.webContents.once('did-finish-load', () => {
    win.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
  })

  return win
}


let setupWin = null
function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 480,
    height: 560,
    frame: false,
    resizable: false,
    center: true,
    transparent: false,
    backgroundColor: '#001C30',
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  loadAppURL(setupWin, getURL('setup'))

  setupWin.on('closed', () => {
    app.quit()
  })

  return setupWin
}

let settingsWin = null
let currentSettingsPage = null
function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return settingsWin
  }
  settingsWin = new BrowserWindow({
    title: 'Settings',
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    resizable: true,
    center: true,
    transparent: false,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  settingsWin.on('page-title-updated', (e) => e.preventDefault())
  loadAppURL(settingsWin, getURL('settings'))
  settingsWin.once('ready-to-show', () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.show()
  })
  settingsWin.on('closed', () => {
    settingsWin = null
    currentSettingsPage = null
    openApps.refresh()
    for (const shell of shells.values()) {
      const tb = shell.topBar
      if (tb && !tb.isDestroyed()) {
        try { tb.moveTop() } catch {}
        try { tb.webContents.invalidate() } catch {}
      }
    }
  })
  return settingsWin
}

ipcMain.handle('windows/open-settings', () => {
  createSettingsWindow()
})

ipcMain.handle('windows/close-settings', () => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.destroy()
  }
})

ipcMain.handle('windows/set-settings-page', (_event, name) => {
  currentSettingsPage = typeof name === 'string' && name ? name : null
  openApps.refresh()
})

const { SETTINGS_ICON_DATA_URL } = require('./settingsIcon')
ipcMain.on('windows/settings-icon', (e) => { e.returnValue = SETTINGS_ICON_DATA_URL })
const SETTINGS_APP_PATH = 'alpine:settings'
openApps.setShellAppsProvider(() => {
  if (!settingsWin || settingsWin.isDestroyed()) return []
  let hwnd = 0
  try { hwnd = settingsWin.getNativeWindowHandle().readUInt32LE(0) } catch { return [] }
  return [{ id: -1, hwnd, name: 'Settings', title: currentSettingsPage || 'Settings', path: SETTINGS_APP_PATH, icon: SETTINGS_ICON_DATA_URL }]
})

app.whenReady().then(async () => {
  if (process.argv.includes('--uninstall-cleanup')) {
    installer.revertSystemChanges()
    app.exit(0)
    return
  }

  if (process.argv.includes('--uninstall')) {
    installer.uninstall()
    app.quit()
    return
  }

  const wallpaperExts = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])
  protocol.handle('alpine-wallpaper', async (request) => {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('p')
    if (!filePath) return new Response(null, { status: 400 })
    const ext = path.extname(filePath).toLowerCase()
    if (!wallpaperExts.has(ext)) return new Response(null, { status: 403 })
    const response = await net.fetch(pathToFileURL(filePath).href)
    return new Response(response.body, {
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  })

  ipc.register(wallpaper, network, bluetooth, openApps, topbarColor, foregroundColor, volume, brightness, power, altTab, setup, mediaSession, microphone, battery, systemInfo, screenshot, launcher, runCommand, launcherHotkey, trayLayout, trayHost, appManager, tiling, updater, windowsUpdate)

  launcherHotkey.setAltTabModule(altTab)
  launcherHotkey.setTriggerCallback(() => launcher.showFromHotkey())

  ipcMain.handle('setup/test-out', () => {
    if (setupWin && !setupWin.isDestroyed()) {
      setupWin.removeAllListeners('closed')
      setupWin.close()
      setupWin = null
    }
    startShellMode()
  })

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

  startShellMode()
})

function startShellMode() {
  let isAlpineShell = null
  if (!setup.isFirstRun()) isAlpineShell = setup.ensureShellRegistration()

  if (shouldTakeOverExplorer && !(isAlpineShell ?? setup.isDefaultShell())) {
    killedExplorer = setup.killExplorer()
  }

  const actingAsShell = killedExplorer || (isAlpineShell ?? setup.isDefaultShell())
  if (shellWindow && actingAsShell) shellWindow.register()

  if (altTab) altTab.setShells(shells)
  if (altTab && altTab.setExposedOwnWindows) {
    altTab.setExposedOwnWindows(() => {
      if (!settingsWin || settingsWin.isDestroyed()) return []
      try { return [settingsWin.getNativeWindowHandle().readUInt32LE(0)] } catch { return [] }
    })
  }

  tiling.setShells(shells)
  if (altTab && altTab.onTilingKey) {
    altTab.onTilingKey((direction, shift) => tiling.handleHotkey(direction, shift))
  }
  if (altTab && altTab.onExplorerKey) {
    altTab.onExplorerKey(() => appActivator.openFileExplorer())
  }

  const screenshotWindow = createScreenshotWindow()
  if (screenshot) {
    screenshot.setOverlayWindow(screenshotWindow)
    altTab.onScreenshot(
      () => screenshot.showOverlay(),
      () => screenshot.hideOverlay()
    )
  }

  launcher.setShells(shells)

  for (const display of screen.getAllDisplays()) {
    createShellForDisplay(display)
  }

  if (powerThrottling) {
    powerThrottling.disableEcoQosForAllProcesses()
    setTimeout(() => powerThrottling.disableEcoQosForAllProcesses(), 3000)
  }

  if (process.env.ALPINE_TRAY_DEBUG) {
    try {
      require('./zorderDebug').start(() => {
        const primaryId = screen.getPrimaryDisplay().id
        return shells.get(primaryId) || [...shells.values()][0]
      })
    } catch (e) {
      console.error('[zorderDebug] start error:', e.message)
    }
  }

  if (!isDev) setTimeout(() => { processAutostart().catch((e) => console.error('[autostart] processAutostart error:', e)) }, 1500)

  screen.on('display-added', (_event, newDisplay) => {
    console.log(`[main] Display added: ${newDisplay.id}`)
    createShellForDisplay(newDisplay)
    if (powerThrottling) {
      setTimeout(() => powerThrottling.disableEcoQosForAllProcesses(), 1500)
    }
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
}

app.on('will-quit', () => {
  unregisterAll()
  if (shellWindow) shellWindow.destroy()
  restoreExplorerIfKilled()
})

function restoreExplorerIfKilled() {
  if (!killedExplorer) return
  killedExplorer = false
  try { setup.restartExplorer() } catch {}
}

function gracefulShutdown() {
  try { unregisterAll() } catch {}
  try { if (shellWindow) shellWindow.destroy() } catch {}
  restoreExplorerIfKilled()
  app.exit(0)
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('SIGBREAK', gracefulShutdown)
process.on('SIGHUP', gracefulShutdown)

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err)
  restoreExplorerIfKilled()
})

process.on('unhandledRejection', (err) => {
  console.error('[main] Unhandled rejection:', err)
  restoreExplorerIfKilled()
})

const { app, BrowserWindow, screen, ipcMain, protocol, net, powerMonitor } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

try { require('node:module').enableCompileCache(path.join(app.getPath('userData'), 'v8-cache')) } catch {}

protocol.registerSchemesAsPrivileged([
  { scheme: 'alpine-wallpaper', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } },
  { scheme: 'alpine-plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
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
const frecency = require('./modules/frecency')
const runCommand = require('./modules/runCommand')
const launcherHotkey = require('./modules/launcherHotkey')
const launcherPrefs = require('./modules/launcherPrefs')
const trayLayout = require('./modules/trayLayout')
const appManager = require('./modules/appManager')
const tiling = require('./modules/tiling')
const minimizeToTopbar = require('./modules/minimizeToTopbar')
const plugins = require('./modules/plugins')
const claudeUsage = require('./modules/claudeUsage')
const displayConfig = require('./modules/displayConfig')
const clockPrefs = require('./modules/clockPrefs')
const bookmarks = require('./modules/bookmarks')
let googleCalendar = null
try { googleCalendar = require('./modules/googleCalendar') } catch (e) { console.error('[main] googleCalendar load error:', e.message) }
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
const gpuPreference = require('./modules/gpuPreference')
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
app.commandLine.appendSwitch('force_high_performance_gpu')

function getURL(mode, displayId) {
  const params = displayId != null ? `mode=${mode}&displayId=${displayId}` : `mode=${mode}`
  if (isDev) return `${BASE_URL}?${params}`
  return `file://${path.join(__dirname, '..', 'dist', 'index.html')}?${params}`
}

function loadAppURL(win, url) {
  win.loadURL(url)
  let attempts = 0
  win.webContents.on('did-finish-load', () => {
    attempts = 0
    if (powerThrottling) powerThrottling.disableEcoQosForAllProcesses()
  })
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

const CURSOR_POLL_FAST_MS = 50
const CURSOR_POLL_SLOW_MS = 150
const NEAR_BAR_MARGIN = 200

const INTERACTIVE_RIGHT = 600
const INTERACTIVE_LEFT = 300
const INTERACTIVE_CENTER = 120

const MENU_HOT_MARGIN = 64
const MENU_CLOSE_GRACE_MS = 300

const shells = new Map()

let cursorTracker = null

function clearCloseGrace(state) {
  if (state.closeGraceTimer) {
    clearTimeout(state.closeGraceTimer)
    state.closeGraceTimer = null
  }
}

function cursorInMenuHotZone(cursor, bounds, region) {
  const top = bounds.y + region.top - MENU_HOT_MARGIN
  const bottom = bounds.y + region.bottom + MENU_HOT_MARGIN
  const left = bounds.x + region.left - MENU_HOT_MARGIN
  const right = bounds.x + region.right + MENU_HOT_MARGIN
  return cursor.y >= top && cursor.y < bottom && cursor.x >= left && cursor.x < right
}

function scheduleMenuClose(win, state) {
  if (!state.activeRegion || state.closeGraceTimer) return
  state.closeGraceTimer = setTimeout(() => {
    state.closeGraceTimer = null
    if (!win.isDestroyed() && state.activeRegion) win.webContents.send('topbar/close-menus')
  }, MENU_CLOSE_GRACE_MS)
}

function evaluateTopBarInteraction(win, state) {
  if (win.isDestroyed()) return
  if (launcher.isLauncherActive(win)) return
  if (altTab && altTab.isAltTabActive(win)) return
  const bounds = state.bounds
  const cursor = screen.getCursorScreenPoint()

  const inBarRow = cursor.y >= bounds.y && cursor.y < bounds.y + TOP_BAR_HEIGHT &&
                   cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width
  const inLeftZone = cursor.x < bounds.x + INTERACTIVE_LEFT
  const inRightZone = cursor.x >= bounds.x + bounds.width - INTERACTIVE_RIGHT
  const centerX = bounds.x + bounds.width / 2
  const inCenterZone = cursor.x >= centerX - INTERACTIVE_CENTER / 2 && cursor.x < centerX + INTERACTIVE_CENTER / 2

  let inInteractive
  if (state.activeRegion) {
    inInteractive = inBarRow || cursorInMenuHotZone(cursor, bounds, state.activeRegion)
  } else {
    inInteractive = inBarRow && (inLeftZone || inRightZone || inCenterZone)
  }

  if (inInteractive) {
    clearCloseGrace(state)
    if (state.ignoring) {
      state.ignoring = false
      win.setIgnoreMouseEvents(false)
    }
  } else {
    if (!state.ignoring) {
      state.ignoring = true
      win.setIgnoreMouseEvents(true)
    }
    scheduleMenuClose(win, state)
  }
}

function isCursorNearBarBand(cursor, state) {
  if (state.activeRegion) return true
  const bounds = state.bounds
  if (cursor.x < bounds.x || cursor.x >= bounds.x + bounds.width) return false
  return cursor.y >= bounds.y - NEAR_BAR_MARGIN && cursor.y < bounds.y + TOP_BAR_HEIGHT + NEAR_BAR_MARGIN
}

function trackCursorInteraction() {
  if (shells.size === 0) return CURSOR_POLL_SLOW_MS
  const cursor = screen.getCursorScreenPoint()
  const nearest = screen.getDisplayNearestPoint(cursor)
  let needsFastPoll = false
  for (const shell of shells.values()) {
    const state = shell.topBarState
    if (shell.display.id === nearest.id || !state.ignoring || state.activeRegion) {
      evaluateTopBarInteraction(shell.topBar, state)
    }
    if (!needsFastPoll && isCursorNearBarBand(cursor, state)) needsFastPoll = true
  }
  return needsFastPoll ? CURSOR_POLL_FAST_MS : CURSOR_POLL_SLOW_MS
}

function scheduleCursorTracking(interval) {
  cursorTracker = setTimeout(() => {
    const nextInterval = trackCursorInteraction()
    scheduleCursorTracking(nextInterval)
  }, interval)
}

function startCursorTracking() {
  if (cursorTracker) return
  scheduleCursorTracking(CURSOR_POLL_FAST_MS)
}

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
  if (!shell.topBar.isDestroyed()) {
    shell.topBar.setBounds({ x, y, width, height })
    if (shell.topBar.refreshBarBounds) shell.topBar.refreshBarBounds()
  }
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

  const state = { ignoring: true, activeRegion: null, bounds: win.getBounds(), closeGraceTimer: null }
  win.topBarState = state

  win.refreshBarBounds = () => {
    if (win.isDestroyed()) return
    state.bounds = win.getBounds()
  }

  win.restorePassiveTopBar = () => {
    if (win.isDestroyed()) return
    if (launcher.isLauncherActive(win)) return
    if (altTab && altTab.isAltTabActive(win)) return
    clearCloseGrace(state)
    state.activeRegion = null
    win.setAlwaysOnTop(false)
    state.ignoring = true
    win.setIgnoreMouseEvents(true)
    evaluateTopBarInteraction(win, state)
  }

  win.on('move', win.refreshBarBounds)
  win.on('resize', win.refreshBarBounds)

  const onSetActiveRegion = (event, region) => {
    if (win.isDestroyed()) return
    if (launcher.isLauncherActive(win)) return
    if (altTab && altTab.isAltTabActive(win)) return
    if (event.sender !== win.webContents) return
    if (region) {
      state.activeRegion = region
      win.setAlwaysOnTop(true, 'screen-saver')
    } else {
      clearCloseGrace(state)
      state.activeRegion = null
      win.setAlwaysOnTop(false)
    }
    evaluateTopBarInteraction(win, state)
  }
  ipcMain.on('topbar/set-active-region', onSetActiveRegion)

  win.on('blur', () => launcher.handleBlur(win))
  win.on('closed', () => {
    clearCloseGrace(state)
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

  shells.set(display.id, { desktop, topBar, display, topBarState: topBar.topBarState })
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
  if (shell.topBar.refreshBarBounds) shell.topBar.refreshBarBounds()

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
let pendingSettingsPage = null
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
    pendingSettingsPage = null
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

ipcMain.handle('windows/open-settings', (_event, page) => {
  const target = typeof page === 'string' && page ? page : null
  const wasOpen = settingsWin && !settingsWin.isDestroyed()
  pendingSettingsPage = target
  createSettingsWindow()
  if (wasOpen && target && settingsWin && !settingsWin.isDestroyed()) {
    const wc = settingsWin.webContents
    if (wc.isLoading()) {
      wc.once('did-finish-load', () => {
        if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('windows/settings-navigate', target)
      })
    } else {
      wc.send('windows/settings-navigate', target)
    }
  }
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
ipcMain.on('windows/settings-init', (e) => {
  e.returnValue = pendingSettingsPage
})
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

  protocol.handle('alpine-plugin', async (request) => {
    const url = new URL(request.url)
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const filePath = plugins.resolvePluginFile(url.hostname, relativePath || 'index.js')
    if (!filePath) return new Response(null, { status: 404 })
    const mime = plugins.mimeFor(path.extname(filePath).toLowerCase())
    if (!mime) return new Response(null, { status: 403 })
    try {
      const data = await fs.promises.readFile(filePath)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })

  ipc.register(wallpaper, network, bluetooth, openApps, topbarColor, foregroundColor, volume, brightness, power, altTab, setup, mediaSession, microphone, battery, systemInfo, screenshot, launcher, frecency, runCommand, launcherHotkey, launcherPrefs, trayLayout, trayHost, appManager, tiling, minimizeToTopbar, displayConfig, updater, windowsUpdate, clockPrefs, googleCalendar, bookmarks, plugins, claudeUsage)

  launcherHotkey.setAltTabModule(altTab)
  launcherHotkey.setTriggerCallback(() => launcher.showFromHotkey())

  if (altTab && altTab.setLauncherCloser) altTab.setLauncherCloser(() => launcher.hideForOverlay())
  if (launcher.setSwitcherCloser) launcher.setSwitcherCloser(() => { if (altTab && altTab.hideForLauncher) altTab.hideForLauncher() })
  if (altTab && altTab.setOverlayDisplayProvider) altTab.setOverlayDisplayProvider(() => launcher.getActiveDisplayId())

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

function getUpdateReadyMarkerPath() {
  const index = process.argv.indexOf('--update-ready-marker')
  if (index === -1 || index + 1 >= process.argv.length) return null
  const value = process.argv[index + 1]
  return value && value.length > 0 ? value : null
}

function signalShellReadyForUpdate() {
  const markerPath = getUpdateReadyMarkerPath()
  if (!markerPath) return

  let written = false
  const writeMarker = () => {
    if (written) return
    written = true
    try {
      fs.writeFileSync(markerPath, String(Date.now()))
    } catch (e) {
      console.error('[main] Failed to write shell-ready marker:', e.message)
    }
  }

  const primaryShell = shells.get(screen.getPrimaryDisplay().id) || [...shells.values()][0]
  if (!primaryShell || primaryShell.desktop.isDestroyed()) {
    writeMarker()
    return
  }

  const wc = primaryShell.desktop.webContents
  if (wc.isLoading()) {
    wc.once('did-finish-load', writeMarker)
  } else {
    writeMarker()
  }
  setTimeout(writeMarker, 10000)
}

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
  if (altTab && altTab.onEmojiKey) {
    altTab.onEmojiKey(() => launcher.showEmoji())
  }
  if (altTab && altTab.setEmojiCapture) {
    launcher.setEmojiCaptureControl((active, hwnd) => altTab.setEmojiCapture(active, hwnd))
    altTab.onEmojiCaptureKey((message) => launcher.forwardEmojiKey(message))
    altTab.onEmojiCaptureClose(() => launcher.closeEmoji())
  }

  if (screenshot) {
    screenshot.setOverlayWindowFactory(createScreenshotWindow)
    altTab.onScreenshot(
      () => screenshot.showOverlay(),
      () => screenshot.hideOverlay()
    )
  }

  launcher.setShells(shells)

  for (const display of screen.getAllDisplays()) {
    createShellForDisplay(display)
  }

  startCursorTracking()

  signalShellReadyForUpdate()

  if (powerThrottling) {
    powerThrottling.disableEcoQosForAllProcesses()
    setTimeout(() => powerThrottling.disableEcoQosForAllProcesses(), 3000)
    const reassertEcoQos = () => powerThrottling.disableEcoQosForAllProcesses()
    powerMonitor.on('on-battery', reassertEcoQos)
    powerMonitor.on('on-ac', reassertEcoQos)
    try { powerMonitor.on('speed-limit-change', reassertEcoQos) } catch {}
    setInterval(reassertEcoQos, 45000)
  }

  if (!isDev) gpuPreference.pinHighPerformanceGpu()

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
  try { frecency.flush() } catch {}
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

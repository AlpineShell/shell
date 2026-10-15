const { app, BrowserWindow, Menu, screen, ipcMain, protocol, net, powerMonitor, session, shell: electronShell } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const installer = require('./modules/installer')
const explorerShell = require('./modules/explorerShell')
const bootRecovery = require('./bootRecovery')
const { createCrashLog, createRepeatFilter, describeError, truncateText } = require('./crashLog')
const { planRendererReload } = require('./rendererRecovery')
const { PRIVILEGED_SCHEMES } = require('./privilegedSchemes')

const crashLog = createCrashLog()
const BOOT_ATTEMPTS_PATH = bootRecovery.bootAttemptsPath(app.getPath('userData'))
const HAND_BACK_CONFIRM_DELAY_MS = 1200

const bypassSingleInstance =
  process.argv.includes('--uninstall') ||
  process.argv.includes('--uninstall-cleanup') ||
  installer.isPortableRun()
const gotSingleInstanceLock = bypassSingleInstance ? true : app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

let bootCountedBeforeThisLaunch = null

function guardsThisLaunch() {
  return bootRecovery.guardsLaunch({ packaged: app.isPackaged, portable: installer.isPortableRun(), argv: process.argv })
}

function guardShellBoot() {
  if (!guardsThisLaunch()) return
  const unfinishedBoots = bootRecovery.readUnfinishedBoots(BOOT_ATTEMPTS_PATH)
  const plan = bootRecovery.decideShellBoot({
    unfinishedBoots,
    argv: process.argv,
    shellHostedByExplorer: () => explorerShell.shellHostedByExplorer(),
  })
  if (plan.action === bootRecovery.FALL_BACK_TO_EXPLORER) {
    console.error(`[main] Alpine Shell did not finish starting ${plan.unfinishedBoots} times in a row, so Explorer takes the shell`)
    crashLog.record('fell-back-to-explorer', { unfinishedBoots: plan.unfinishedBoots, startedExplorer: plan.startExplorer })
    bootRecovery.fallBackToExplorer(plan)
    process.exit(1)
  }
  bootRecovery.recordUnfinishedBoots(BOOT_ATTEMPTS_PATH, plan.unfinishedBoots)
  bootCountedBeforeThisLaunch = unfinishedBoots
}

function forgetBootAttempts() {
  bootRecovery.forgetUnfinishedBoots(BOOT_ATTEMPTS_PATH)
}

function uncountThisLaunch() {
  if (bootCountedBeforeThisLaunch === null) return
  bootRecovery.restoreUnfinishedBoots(BOOT_ATTEMPTS_PATH, bootCountedBeforeThisLaunch)
  bootCountedBeforeThisLaunch = null
}

if (gotSingleInstanceLock) guardShellBoot()

try { require('node:module').enableCompileCache(path.join(app.getPath('userData'), 'v8-cache')) } catch {}

protocol.registerSchemesAsPrivileged(PRIVILEGED_SCHEMES)
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
const shellExclusivity = require('./modules/shellExclusivity')
const mediaSession = require('./modules/mediaSession')
const microphone = require('./modules/microphone')
const battery = require('./modules/battery')
const batterySaver = require('./modules/batterySaver')
const systemInfo = require('./modules/systemInfo')
const launcher = require('./modules/launcher')
const appCatalog = require('./modules/appCatalog')
const appLaunch = require('./modules/appLaunch')
const frecency = require('./modules/frecency')
const runCommand = require('./modules/runCommand')
const launcherHotkey = require('./modules/launcherHotkey')
const launcherPrefs = require('./modules/launcherPrefs')
const trayLayout = require('./modules/trayLayout')
const appManager = require('./modules/appManager')
const tiling = require('./modules/tiling')
const minimizeToTopbar = require('./modules/minimizeToTopbar')
const windowCorners = require('./modules/windowCorners')
const openWithPlacement = require('./modules/openWithPlacement')
const windowCoverage = require('./modules/windowCoverage')
const windowSystemMenu = require('./modules/windowSystemMenu')
const winEvents = require('./modules/winEvents')
const plugins = require('./modules/plugins')
const pluginSettings = require('./modules/pluginSettings')
const pluginBackendHost = require('./pluginBackendHost')
const pluginWindows = require('./pluginWindows')
const { launchCommand } = require('./shellLaunch')
const { isPointInMenuHotZone, shouldClickCloseMenu } = require('./menuHotZone')
const { sanitizeInteractiveZones, isCursorInInteractiveZone } = require('./topbarInteractiveZones')
const shellNotice = require('./modules/shellNotice')

const OPEN_APP_TIMEOUT_MS = 300000
const fileHandlers = require('./modules/fileHandlers')
const displayConfig = require('./modules/displayConfig')
const displayModePicker = require('./modules/displayModePicker')
const clockPrefs = require('./modules/clockPrefs')
const topbarLayout = require('./modules/topbarLayout')
const theme = require('./modules/theme')
const keyboardLayout = require('./modules/keyboardLayout')
const bookmarks = require('./modules/bookmarks')
const browserTabs = require('./modules/browserTabs')
const sqliteWorker = require('./modules/sqliteWorker')
let googleCalendar = null
try { googleCalendar = require('./modules/googleCalendar') } catch (e) { console.error('[main] googleCalendar load error:', e.message) }
const appActivator = require('./appActivator')
let trayHost = null
try { trayHost = require('./modules/trayHost') } catch (e) { console.error('[main] trayHost load error:', e.message) }
const keyboardHook = require('./modules/keyboardHook')
const shellHotkeys = require('./modules/shellHotkeys')
const emojiKeyCapture = require('./modules/emojiKeyCapture')
const displayModeKeyCapture = require('./modules/displayModeKeyCapture')
const windowSwitcher = require('./modules/windowSwitcher')
const switcherWindows = require('./modules/switcherWindows')
const shellSurfaces = require('./modules/shellSurfaces')
const activeDisplay = require('./modules/activeDisplay')
const minimizeAll = require('./modules/minimizeAll')
let screenshot = null
try { screenshot = require('./modules/screenshot') } catch (e) { console.error('[main] screenshot load error:', e.message) }
let powerThrottling = null
try { powerThrottling = require('./modules/powerThrottling') } catch (e) { console.error('[main] powerThrottling load error:', e.message) }
let shellWindow = null
try { shellWindow = require('./modules/shellWindow') } catch (e) { console.error('[main] shellWindow load error:', e.message) }
const gpuPreference = require('./modules/gpuPreference')
const colorMode = require('./modules/colorMode')
const { processAutostart } = require('./modules/autostart')
const updater = require('./modules/updater')
const windowsUpdate = require('./modules/windowsUpdate')
const licence = require('./modules/licence')
const { planStartupForLicence } = require('./licenceStartup')
const trustedSenders = require('./trustedSenders')
const pageUrls = require('./pageUrls')
const { keepToShellPages } = require('./shellPageGuard')
const {
  registerAppBar,
  unregisterAppBar,
  unregisterAll,
  scheduleReassert,
  isSettingWorkArea,
} = require('./modules/appbar')

const isDev = !app.isPackaged
const BASE_URL = isDev ? 'http://127.0.0.1:5173' : null
const APP_INDEX_PATH = path.join(__dirname, '..', 'dist', 'index.html')
const APP_LOCATION = { indexPath: isDev ? null : APP_INDEX_PATH, devServerUrl: BASE_URL }
const GRANTED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

trustedSenders.setAppLocation(APP_LOCATION)

const UPDATE_READY_TIMEOUT_MS = 10000
const SCREENSHOT_AFTER_LAUNCHER_MS = 200
const settledTopBars = new Set()
let topBarSettleListener = null
let updateReadySignalled = false

// ── Single instance + alpine-shell:// deep links ─────────────────────────────
// A normal packaged run holds a single-instance lock, so the website "Install in
// Alpine Shell" link (or any second launch) is forwarded to the already-running
// shell instead of spawning a second one. Portable bootstrap runs, uninstall /
// cleanup launches and dev bypass the lock — they legitimately hand off to, or
// coexist with, another process and must never be blocked by it.
function shellLaunchCommand() {
  return launchCommand({
    execPath: process.execPath,
    argv: process.argv,
    runsFromSource: Boolean(process.defaultApp),
  })
}

if (!bypassSingleInstance) {
  const launch = shellLaunchCommand()
  if (launch.args.length) {
    app.setAsDefaultProtocolClient('alpine-shell', launch.target, launch.args)
  } else {
    app.setAsDefaultProtocolClient('alpine-shell')
  }
  console.log('[deeplink] single-instance lock held; alpine-shell:// registered')
}

app.on('second-instance', (_event, argv) => {
  const link = argv.find((a) => typeof a === 'string' && a.startsWith('alpine-shell://'))
  if (link) {
    handleDeepLink(link)
    return
  }
  const file = fileHandlers.findHandledFile(argv)
  if (file) {
    fileHandlers.openFile(file).catch((e) => console.error('[main] file open failed:', e && e.message))
    return
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore()
    settingsWin.focus()
  }
})

// macOS delivers deep links via open-url rather than argv; harmless on Windows.
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

app.commandLine.appendSwitch('disable-features', 'NetworkServiceSandbox,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
if (gpuPreference.prefersHighPerformanceGpu()) app.commandLine.appendSwitch('force_high_performance_gpu')

function getURL(mode, displayId) {
  const params = displayId != null ? `mode=${mode}&displayId=${displayId}` : `mode=${mode}`
  if (isDev) return `${BASE_URL}?${params}`
  return `${pathToFileURL(APP_INDEX_PATH).href}?${params}`
}

function openInBrowser(url) {
  if (!pageUrls.isBrowserLink(url)) return
  electronShell.openExternal(url).catch((e) => console.error('[main] could not open link:', e && e.message))
}

app.on('web-contents-created', (_event, contents) => keepToShellPages(contents, APP_LOCATION, openInBrowser))

function grantOnlyShellPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(GRANTED_PERMISSIONS.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => GRANTED_PERMISSIONS.has(permission))
}

function loadAppURL(win, url) {
  win.loadURL(url)
  let attempts = 0
  win.webContents.on('did-finish-load', () => {
    attempts = 0
    if (powerThrottling) powerThrottling.applyEcoQosToAllProcesses()
  })
  win.webContents.on('did-fail-load', (_event, errorCode, _desc, _validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || attempts >= 30) return
    attempts++
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL(url) }, Math.min(2000, 400 + attempts * 200))
  })
  let recentCrashes = []
  win.webContents.on('render-process-gone', (_event, details) => {
    if (win.isDestroyed()) return
    const plan = planRendererReload({ recentCrashes, now: Date.now() })
    recentCrashes = plan.crashes
    crashLog.record('render-process-gone', { view: viewOfURL(url), reason: details?.reason ?? null, exitCode: details?.exitCode ?? null, reloading: plan.reload })
    if (!plan.reload) {
      letClicksThroughDeadTopBar(win)
      return
    }
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL(url) }, plan.delayMs)
  })
}

function viewOfURL(url) {
  try {
    return new URL(url).searchParams.get('mode')
  } catch {
    return null
  }
}

function letClicksThroughDeadTopBar(win) {
  if (win.isDestroyed() || !win.topBarState) return
  win.topBarState.interactiveZones = []
  if (win.restorePassiveTopBar) win.restorePassiveTopBar()
}

const TOP_BAR_HEIGHT = 24
const RAISED_REGION_PAD = 60

const CURSOR_POLL_FAST_MS = 50
const CURSOR_POLL_SLOW_MS = 150
const NEAR_BAR_MARGIN = 200

const MENU_CLOSE_GRACE_MS = 300

const shells = new Map()

let cursorTracker = null

function clearCloseGrace(state) {
  if (state.closeGraceTimer) {
    clearTimeout(state.closeGraceTimer)
    state.closeGraceTimer = null
  }
}

function closeActiveMenu(win, state) {
  clearCloseGrace(state)
  if (win.isDestroyed() || !state.activeRegion) return
  win.webContents.send('topbar/close-menus')
}

function scheduleMenuClose(win, state) {
  if (!state.activeRegion || state.closeGraceTimer) return
  state.closeGraceTimer = setTimeout(() => {
    state.closeGraceTimer = null
    closeActiveMenu(win, state)
  }, MENU_CLOSE_GRACE_MS)
}

function hookSurfaceOwnsTopBar(win) {
  return windowSwitcher.ownsTopBar(win) || displayModePicker.isActive(win)
}

function evaluateTopBarInteraction(win, state) {
  if (win.isDestroyed()) return
  if (launcher.isLauncherActive(win)) return
  if (hookSurfaceOwnsTopBar(win)) return
  const bounds = state.bounds
  const cursor = screen.getCursorScreenPoint()

  const inBarRow = cursor.y >= bounds.y && cursor.y < bounds.y + TOP_BAR_HEIGHT &&
                   cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width

  let inInteractive
  if (state.activeRegion) {
    inInteractive = inBarRow || isPointInMenuHotZone(cursor, bounds, state.activeRegion)
  } else {
    inInteractive = inBarRow && isCursorInInteractiveZone(cursor.x - bounds.x, state.interactiveZones, bounds.width)
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
      devTools: isDev,
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
      devTools: isDev,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(false)
  win.setIgnoreMouseEvents(true)
  loadAppURL(win, getURL('topbar', display.id))

  const state = { ignoring: true, activeRegion: null, interactiveZones: null, bounds: win.getBounds(), closeGraceTimer: null }
  win.topBarState = state

  win.refreshBarBounds = () => {
    if (win.isDestroyed()) return
    state.bounds = win.getBounds()
  }

  win.setRaisedBounds = (bottom) => {
    if (win.isDestroyed()) return
    const db = screen.getDisplayMatching(win.getBounds()).bounds
    const height = Math.min(db.height, Math.max(TOP_BAR_HEIGHT, Math.ceil(bottom) + RAISED_REGION_PAD))
    win.setBounds({ x: db.x, y: db.y, width: db.width, height })
  }

  win.restoreFullBounds = () => {
    if (win.isDestroyed()) return
    const db = screen.getDisplayMatching(win.getBounds()).bounds
    win.setBounds({ x: db.x, y: db.y, width: db.width, height: db.height })
  }

  win.restorePassiveTopBar = () => {
    if (win.isDestroyed()) return
    if (launcher.isLauncherActive(win)) return
    if (hookSurfaceOwnsTopBar(win)) return
    clearCloseGrace(state)
    state.activeRegion = null
    win.watchInputWhileRegionArmed(false)
    win.setAlwaysOnTop(false)
    win.restoreFullBounds()
    state.ignoring = true
    win.setIgnoreMouseEvents(true)
    evaluateTopBarInteraction(win, state)
  }

  win.on('move', win.refreshBarBounds)
  win.on('resize', win.refreshBarBounds)

  const onTopBarInput = (_event, input) => {
    if (input.type !== 'mouseDown') return
    if (!state.activeRegion) return
    if (launcher.isLauncherActive(win)) return
    if (hookSurfaceOwnsTopBar(win)) return
    const click = { x: state.bounds.x + input.x, y: state.bounds.y + input.y }
    if (!shouldClickCloseMenu(click, state.bounds, state.activeRegion)) return
    closeActiveMenu(win, state)
  }

  win.watchInputWhileRegionArmed = (armed) => {
    if (win.isDestroyed()) return
    win.webContents.removeListener('input-event', onTopBarInput)
    if (armed) win.webContents.on('input-event', onTopBarInput)
  }

  const onSetActiveRegion = (event, region) => {
    if (win.isDestroyed()) return
    if (launcher.isLauncherActive(win)) return
    if (hookSurfaceOwnsTopBar(win)) return
    if (event.sender !== win.webContents) return
    if (region) {
      state.activeRegion = region
      win.setRaisedBounds(region.bottom)
      win.setAlwaysOnTop(true, 'screen-saver')
    } else {
      clearCloseGrace(state)
      state.activeRegion = null
      win.setAlwaysOnTop(false)
      win.restoreFullBounds()
    }
    win.watchInputWhileRegionArmed(Boolean(region))
    evaluateTopBarInteraction(win, state)
  }
  ipcMain.on('topbar/set-active-region', onSetActiveRegion)

  const onSetInteractiveZones = (event, zones) => {
    if (win.isDestroyed()) return
    if (event.sender !== win.webContents) return
    state.interactiveZones = sanitizeInteractiveZones(zones, state.bounds.width)
    evaluateTopBarInteraction(win, state)
  }
  ipcMain.on('topbar/set-interactive-zones', onSetInteractiveZones)

  win.on('blur', () => launcher.handleBlur(win))
  win.on('closed', () => {
    clearCloseGrace(state)
    ipcMain.removeListener('topbar/set-active-region', onSetActiveRegion)
    ipcMain.removeListener('topbar/set-interactive-zones', onSetInteractiveZones)
    settledTopBars.delete(win)
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
      markTopBarSettled(win)
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
  reviewTopBarsSettled()
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
      devTools: isDev,
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


const SETUP_WINDOW_WIDTH = 480
const SETUP_WINDOW_INITIAL_HEIGHT = 208
const SETUP_WINDOW_BACKGROUND = '#f9fafb'
const STARTUP_SIGN_IN_DELAY_MS = 2500

let shellModeRunning = false
let setupWin = null

function setupWindowUrl(page) {
  const base = getURL('setup')
  return page ? `${base}&page=${encodeURIComponent(page)}` : base
}

function createSetupWindow(page) {
  if (setupWin && !setupWin.isDestroyed()) {
    if (setupWin.isMinimized()) setupWin.restore()
    setupWin.focus()
    return setupWin
  }
  setupWin = new BrowserWindow({
    width: SETUP_WINDOW_WIDTH,
    height: SETUP_WINDOW_INITIAL_HEIGHT,
    frame: false,
    resizable: false,
    center: true,
    transparent: false,
    backgroundColor: SETUP_WINDOW_BACKGROUND,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDev,
    },
  })

  loadAppURL(setupWin, setupWindowUrl(page))

  setupWin.on('closed', () => {
    setupWin = null
    if (!shellModeRunning) app.quit()
  })

  return setupWin
}

function closeSetupWindow() {
  if (!setupWin || setupWin.isDestroyed()) return
  setupWin.removeAllListeners('closed')
  setupWin.close()
  setupWin = null
}

let settingsWin = null
let currentSettingsPage = null
let pendingSettingsPage = null

function exposedOwnWindowHandles() {
  const handles = pluginWindows.nativeHandles()
  if (settingsWin && !settingsWin.isDestroyed()) {
    try { handles.push(settingsWin.getNativeWindowHandle().readUInt32LE(0)) } catch {}
  }
  return handles
}

function ridgeColoredWindowHandles() {
  if (!settingsWin || settingsWin.isDestroyed()) return []
  try { return [settingsWin.getNativeWindowHandle().readUInt32LE(0)] } catch { return [] }
}

const SETTINGS_TITLE_BAR_HEIGHT = 48

function settingsTitleBarOverlay() {
  return { ...theme.getTitleBarOverlayColors(), height: SETTINGS_TITLE_BAR_HEIGHT }
}

function repaintSettingsChrome() {
  if (!settingsWin || settingsWin.isDestroyed()) return
  settingsWin.setBackgroundColor(theme.getWindowBackground())
  settingsWin.setTitleBarOverlay(settingsTitleBarOverlay())
}

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
    titleBarStyle: 'hidden',
    titleBarOverlay: settingsTitleBarOverlay(),
    resizable: true,
    center: true,
    transparent: false,
    skipTaskbar: false,
    show: false,
    backgroundColor: theme.getWindowBackground(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDev,
    },
  })
  settingsWin.on('page-title-updated', (e) => e.preventDefault())
  windowSystemMenu.enableSystemMenu(settingsWin)
  windowCorners.roundOwnWindow(settingsWin)
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

function openSettingsToPlugins(deepInstall) {
  pendingSettingsPage = 'plugins'
  const win = createSettingsWindow()
  if (!win) return
  const send = () => {
    if (!win || win.isDestroyed()) return
    win.webContents.send('windows/settings-navigate', 'plugins')
    if (deepInstall) win.webContents.send('plugins/deep-install', deepInstall)
    if (win.isMinimized()) win.restore()
    win.focus()
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

function openSettingsFromHotkey() {
  if (!settingsWin || settingsWin.isDestroyed()) pendingSettingsPage = null
  const win = createSettingsWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

function handleDeepLink(rawUrl) {
  console.log('[deeplink] received:', rawUrl)
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return
  }
  if (parsed.protocol !== 'alpine-shell:') return
  const action = (parsed.hostname || parsed.pathname.replace(/^\/+/, '')).toLowerCase()
  if (action === 'install-plugin') {
    const id = parsed.searchParams.get('id')
    if (!id) return
    openSettingsToPlugins({ id, version: parsed.searchParams.get('version') || '' })
    return
  }
  if (action === 'open-app') {
    openPluginApp(parsed.searchParams.get('plugin'), parsed.searchParams.get('app'))
  }
}

// A shortcut in a plugin's launcher folder points here rather than at anything the plugin
// ships, so launching an app goes through the shell like opening a file does. Any local
// process can invoke a URL scheme, so the command is not taken from the URL: only the
// openCommand the plugin declared for that folder is ever sent, and only while it is on.
function openPluginApp(pluginId, app) {
  if (!pluginId || !app) return
  const record = plugins.listPlugins().find((entry) => entry.id === pluginId)
  if (!record || record.enabled === false || record.loadable !== true) {
    shellNotice.show({
      title: 'Alpine Shell',
      message: `${app} needs the ${pluginId} plugin, which is not enabled.`,
      tone: 'error',
      action: { label: 'Open plugins', run: () => openSettingsToPlugins() },
      timeoutMs: 0,
    })
    return
  }
  const folder = ((record.contributes && record.contributes.launcherFolders) || []).find((entry) => entry.openCommand)
  if (!folder) return
  shellNotice.show({ id: 'open-app', title: record.name || pluginId, message: `Opening ${app}…`, busy: true, pill: true, timeoutMs: 0 })
  pluginBackendHost
    .sendCommand(pluginId, folder.openCommand, { app }, { timeoutMs: OPEN_APP_TIMEOUT_MS })
    .then((reply) => {
      const value = reply.ok && reply.value && typeof reply.value === 'object' ? reply.value : {}
      const failed = !reply.ok || value.ok === false
      shellNotice.show({
        id: 'open-app',
        title: record.name || pluginId,
        message: value.message || (failed ? `${app} could not be opened: ${reply.error || 'the plugin refused'}` : `${app} is open.`),
        tone: failed ? 'error' : 'success',
        pill: !failed,
        timeoutMs: failed ? 0 : 5000,
      })
    })
    .catch((e) => console.error('[deeplink] open-app failed:', e && e.message))
}

ipc.handle('windows/open-settings', (_event, page) => {
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

ipc.handle('windows/close-settings', () => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.destroy()
  }
})

ipc.handle('windows/set-settings-page', (_event, name) => {
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

app.whenReady().then(startApp).catch(recoverFromFailedStart).catch(() => app.exit(1))

function recoverFromFailedStart(error) {
  console.error('[main] Alpine Shell could not start:', error)
  crashLog.record('startup-failed', describeError(error))
  try { if (shellWindow) shellWindow.destroy() } catch {}
  try { unregisterAll() } catch {}
  const plan = bootRecovery.planFailedStart({
    guarded: guardsThisLaunch(),
    updaterAwaitsReady: isUpdateRestart() && !updateReadySignalled,
    get explorerHostsShell() { return explorerShell.shellHostedByExplorer() },
    get optedOut() { return installer.isShellOptedOut() },
  })
  if (plan.action === bootRecovery.HAND_SIGN_IN_TO_EXPLORER) {
    handSignInToExplorer(() => app.exit(1))
    return
  }
  if (plan.action === bootRecovery.FALL_BACK_TO_EXPLORER) bootRecovery.fallBackToExplorer(plan)
  app.exit(1)
}

function handSignInToExplorer(done) {
  const revert = installer.revertShellTemporarily()
  if (!revert.success) {
    console.error('[main] The hand-back helper did not start, so Explorer takes the shell directly:', revert.error)
    bootRecovery.fallBackToExplorer({ startExplorer: true })
    done()
    return
  }
  setTimeout(() => {
    if (!installer.isRevertHelperRunning(revert.handoff)) {
      revert.abandonHandoff()
      bootRecovery.fallBackToExplorer({ startExplorer: true })
    }
    done()
  }, HAND_BACK_CONFIRM_DELAY_MS)
}

async function startApp() {
  grantOnlyShellPermissions()
  if (!isDev) Menu.setApplicationMenu(null)

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

  if (!gotSingleInstanceLock) return

  if (setup.shouldLeaveShellToExplorer(process.argv)) {
    console.log('[main] Explorer holds the shell until the next sign-in, so this autostart launch exits')
    uncountThisLaunch()
    app.exit(0)
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

  fileHandlers.setPluginsPageOpener(() => openSettingsToPlugins())

  trustedSenders.setTrustedWindowsAccessor(() => ({
    [trustedSenders.SETUP_WINDOW]: setupWin,
    [trustedSenders.SETTINGS_WINDOW]: settingsWin,
  }))

  sqliteWorker.removeLeftoverSnapshots()

  ipc.register(wallpaper, network, bluetooth, openApps, topbarColor, foregroundColor, volume, brightness, power, keyboardHook, windowSwitcher, displayModePicker, setup, mediaSession, microphone, battery, batterySaver, systemInfo, screenshot, launcher, appCatalog, appLaunch, minimizeAll, frecency, runCommand, launcherHotkey, launcherPrefs, trayLayout, trayHost, topbarLayout, appManager, tiling, minimizeToTopbar, windowCorners, openWithPlacement, windowCoverage, displayConfig, updater, windowsUpdate, clockPrefs, theme, keyboardLayout, googleCalendar, bookmarks, browserTabs, plugins, pluginSettings, pluginBackendHost, shellNotice, fileHandlers, gpuPreference, colorMode, licence)

  theme.followTopbarColor(topbarColor)
  theme.onThemeChange(repaintSettingsChrome)

  setup.setShellShutdown(gracefulShutdown)

  launcherHotkey.setTriggerCallback(() => launcher.showFromHotkey())

  windowSwitcher.setLauncherCloser(() => launcher.hideForOverlay())
  if (launcher.setSwitcherCloser) launcher.setSwitcherCloser(() => {
    windowSwitcher.hideForLauncher()
    displayModePicker.hide()
  })
  appLaunch.setShellLinkOpener((link) => handleDeepLink(link))
  activeDisplay.setPreferredDisplayProvider(() => launcher.getActiveDisplayId())
  launcher.setDisplayProvider(() => activeDisplay.currentDisplay())

  ipc.handle('setup/test-out', trustedSenders.guardHandler(async () => {
    try {
      licence.requireValid()
    } catch (e) {
      if (e && e.code === 'licence-required') return { error: 'licence-required' }
      throw e
    }
    const explorerRetired = await setup.beginTestSession()
    if (!setupWin) return { error: null }
    closeSetupWindow()
    startShellMode()
    if (explorerRetired && trayHost) trayHost.announceTaskbar()
    return { error: null }
  }, [trustedSenders.SETUP_WINDOW]))

  ipcMain.on('setup/fit-window-height', (_event, height) => {
    if (!setupWin || setupWin.isDestroyed() || !Number.isFinite(height)) return
    setupWin.setContentSize(SETUP_WINDOW_WIDTH, Math.ceil(height))
  })

  if (process.argv.includes('--setup')) {
    createSetupWindow()
    return
  }

  if (!isDev && (installer.isPortableRun() || setup.isFirstRun() || !licenceStartupPlan(licence.status()).startShell)) {
    forgetBootAttempts()
    createSetupWindow()
    return
  }

  startShellMode()

  const startupLink = process.argv.find((a) => typeof a === 'string' && a.startsWith('alpine-shell://'))
  if (startupLink) setTimeout(() => handleDeepLink(startupLink), 500)

  const startupFile = fileHandlers.findHandledFile(process.argv)
  if (startupFile) {
    setTimeout(() => {
      fileHandlers.openFile(startupFile).catch((e) => console.error('[main] file open failed:', e && e.message))
    }, 1500)
  }
}

function getUpdateReadyMarkerPath() {
  const index = process.argv.indexOf('--update-ready-marker')
  if (index === -1 || index + 1 >= process.argv.length) return null
  const value = process.argv[index + 1]
  return value && value.length > 0 ? value : null
}

function isUpdateRestart() {
  return getUpdateReadyMarkerPath() !== null
}

function markTopBarSettled(win) {
  settledTopBars.add(win)
  reviewTopBarsSettled()
}

function reviewTopBarsSettled() {
  if (areAllTopBarsSettled()) forgetBootAttempts()
  if (topBarSettleListener) topBarSettleListener()
}

function areAllTopBarsSettled() {
  const topBars = [...shells.values()].map(shell => shell.topBar)
  return topBars.length > 0 && topBars.every(topBar => settledTopBars.has(topBar))
}

function signalShellReadyForUpdate() {
  const markerPath = getUpdateReadyMarkerPath()
  if (!markerPath) return

  const writeMarker = () => {
    if (updateReadySignalled) return
    updateReadySignalled = true
    topBarSettleListener = null
    try {
      fs.writeFileSync(markerPath, String(Date.now()))
    } catch (e) {
      console.error('[main] Failed to write shell-ready marker:', e.message)
    }
  }

  setTimeout(writeMarker, UPDATE_READY_TIMEOUT_MS)

  const primaryShell = shells.get(screen.getPrimaryDisplay().id) || [...shells.values()][0]
  if (!primaryShell || primaryShell.desktop.isDestroyed()) {
    writeMarker()
    return
  }

  let desktopLoaded = !primaryShell.desktop.webContents.isLoading()
  const writeMarkerWhenSettled = () => {
    if (desktopLoaded && areAllTopBarsSettled()) writeMarker()
  }

  if (!desktopLoaded) {
    primaryShell.desktop.webContents.once('did-finish-load', () => {
      desktopLoaded = true
      writeMarkerWhenSettled()
    })
  }

  topBarSettleListener = writeMarkerWhenSettled
  writeMarkerWhenSettled()
}

function licenceStartupPlan(status) {
  return planStartupForLicence(status, {
    packaged: !isDev,
    get desktopClaimedByAlpine() { return setup.isDesktopClaimedByAlpine() },
  })
}

function openSignInWhenUnlicensed() {
  const status = licence.status()
  const plan = licenceStartupPlan(status)
  if (!plan.openSignIn) return
  console.error(`[licence] no verifiable licence on this PC (${status.reason}); the shell keeps running and the sign-in window opens`)
  setTimeout(() => createSetupWindow('signIn'), STARTUP_SIGN_IN_DELAY_MS)
}

function wireShellHotkeys() {
  shellHotkeys.on('tile', ({ direction, shift }) => tiling.handleHotkey(direction, shift))
  shellHotkeys.on('openFileExplorer', () => appActivator.openFileExplorer())
  shellHotkeys.on('openSettings', () => openSettingsFromHotkey())
  shellHotkeys.on('openEmojiPicker', () => launcher.showEmoji())
  shellHotkeys.on('openDisplayModePicker', () => displayModePicker.open())
  shellHotkeys.on('minimizeAll', () => minimizeAll.minimizeAll())
  shellHotkeys.on('restoreMinimized', () => minimizeAll.restoreMinimized())
  if (screenshot) {
    shellHotkeys.on('takeScreenshot', () => screenshot.showOverlay())
    shellHotkeys.on('cancelScreenshot', () => screenshot.hideOverlay())
  }
}

function wireKeyCaptures() {
  displayModePicker.setKeyCaptureControl((active) => displayModeKeyCapture.setActive(active))
  displayModeKeyCapture.onKey((action) => displayModePicker.handleKeyAction(action))
  launcher.setEmojiCaptureControl((active, hwnd) => emojiKeyCapture.setActive(active, hwnd))
  emojiKeyCapture.onKey((message) => launcher.forwardEmojiKey(message))
  emojiKeyCapture.onClose(() => launcher.closeEmoji())
}

function routeKeyboardInput() {
  keyboardHook.setKeyHandlers([
    shellHotkeys.handleWinTap,
    emojiKeyCapture.handleKey,
    displayModeKeyCapture.handleKey,
    shellHotkeys.handleShortcut,
    windowSwitcher.handleKey,
  ])
}

function startShellMode() {
  if (shellModeRunning) return
  shellModeRunning = true
  openSignInWhenUnlicensed()

  if (isUpdateRestart()) installer.clearUpdateHandoff()

  const takeover = setup.takeOverFromExplorer()

  if (shellWindow && takeover.actingAsShell) {
    shellWindow.onAppCommand(volume.applyAppCommand)
    shellWindow.register()
  }

  shellSurfaces.setShells(shells)
  switcherWindows.setExposedOwnWindows(exposedOwnWindowHandles)

  tiling.setShells(shells)
  tiling.setExposedOwnWindows(exposedOwnWindowHandles)
  winEvents.setExposedOwnWindows(exposedOwnWindowHandles)
  windowCoverage.setExposedOwnWindows(exposedOwnWindowHandles)
  foregroundColor.setRidgeColoredWindows(ridgeColoredWindowHandles)
  displayModePicker.setShells(shells)
  displayModePicker.setOtherSurfacesCloser(() => {
    launcher.hideForOverlay()
    windowSwitcher.hideForLauncher()
  })
  displayModePicker.setDisplayProvider(() => activeDisplay.currentDisplay())

  if (screenshot) {
    screenshot.setOverlayWindowFactory(createScreenshotWindow)
    screenshot.prewarmOverlay()
    launcher.setScreenshotStarter(() => setTimeout(() => screenshot.showOverlay(), SCREENSHOT_AFTER_LAUNCHER_MS))
  }

  wireShellHotkeys()
  wireKeyCaptures()
  routeKeyboardInput()


  for (const display of screen.getAllDisplays()) {
    createShellForDisplay(display)
  }

  startCursorTracking()

  signalShellReadyForUpdate()

  if (powerThrottling) {
    powerThrottling.applyEcoQosToAllProcesses()
    setTimeout(() => powerThrottling.applyEcoQosToAllProcesses(), 3000)
    const reassertEcoQos = () => powerThrottling.applyEcoQosToAllProcesses()
    powerMonitor.on('on-battery', reassertEcoQos)
    powerMonitor.on('on-ac', reassertEcoQos)
    try { powerMonitor.on('speed-limit-change', reassertEcoQos) } catch {}
    setInterval(reassertEcoQos, 45000)
  }

  if (!isDev) gpuPreference.applyStoredGpuPreference()

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

  const autostartContext = {
    development: isDev,
    updateRestart: isUpdateRestart(),
    actingAsShell: takeover.actingAsShell,
    launchedByAutostart: setup.isAutostartLaunch(process.argv),
    get ranThisLogon() { return installer.autostartRanThisLogon() },
  }
  setTimeout(() => {
    if (!shellExclusivity.shouldProcessAutostart(autostartContext)) return
    installer.recordAutostartLogon()
    processAutostart().catch((e) => console.error('[autostart] processAutostart error:', e))
  }, 1500)

  screen.on('display-added', (_event, newDisplay) => {
    console.log(`[main] Display added: ${newDisplay.id}`)
    createShellForDisplay(newDisplay)
    scheduleReassert()
    if (powerThrottling) {
      setTimeout(() => powerThrottling.applyEcoQosToAllProcesses(), 1500)
    }
  })

  screen.on('display-removed', (_event, oldDisplay) => {
    console.log(`[main] Display removed: ${oldDisplay.id}`)
    destroyShellForDisplay(oldDisplay.id)
    scheduleReassert()
  })

  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    if (isSettingWorkArea()) return

    if (changedMetrics.length === 1 && changedMetrics[0] === 'workArea') {
      const shell = shells.get(display.id)
      if (shell) forceShellBounds(shell)
      scheduleReassert()
      return
    }

    console.log(`[main] Display metrics changed: ${display.id} [${changedMetrics.join(', ')}]`)
    if (changedMetrics.includes('bounds') || changedMetrics.includes('scaleFactor')) {
      repositionShell(display)
    }
    scheduleReassert()
  })
}

app.on('will-quit', () => {
  unregisterAll()
  undimDisplays()
  if (shellWindow) shellWindow.destroy()
})

function undimDisplays() {
  try { brightness.restoreBatterySaverBrightnessOnShutdown() } catch (e) {
    console.error('[main] battery saver brightness restore failed:', e?.message ?? e)
  }
}

function gracefulShutdown() {
  try { unregisterAll() } catch {}
  undimDisplays()
  try { if (shellWindow) shellWindow.destroy() } catch {}
  try { frecency.flush() } catch {}
  app.exit(0)
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('SIGBREAK', gracefulShutdown)
process.on('SIGHUP', gracefulShutdown)

const { listenForLauncherQuit } = require('./devLauncherControl')
if (isDev) listenForLauncherQuit({ pipePath: process.env.ALPINE_DEV_CONTROL_PIPE, quit: () => app.quit() })

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err)
  crashLog.record('uncaught-exception', describeError(err))
})

process.on('unhandledRejection', (err) => {
  console.error('[main] Unhandled rejection:', err)
  crashLog.record('unhandled-rejection', describeError(err))
})

app.on('child-process-gone', (_event, details) => {
  if (details.reason === 'clean-exit') return
  crashLog.record('child-process-gone', {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    name: details.name ?? details.serviceName ?? null,
  })
})

const isRepeatedRenderError = createRepeatFilter()

ipcMain.on('shell/render-error', (event, detail) => {
  const view = viewOfURL(event.sender.getURL())
  if (isRepeatedRenderError(`render-error:${view}`)) return
  crashLog.record('render-error', {
    view,
    detail: truncateText(typeof detail === 'string' ? detail : String(detail)),
  })
})

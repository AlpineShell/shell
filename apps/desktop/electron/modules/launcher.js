const { BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { activateWindow, forceForeground, getForegroundWindow, minimizeWindow, maximizeWindow, closeWindow, insertText, pasteInto } = require('./winFocus')
const { focusTargetOnHide, captureFocusTarget } = require('./launcherFocusPolicy')
const appActivator = require('../appActivator')
const appCatalog = require('./appCatalog')
const appLaunch = require('./appLaunch')
const shellSurfaces = require('./shellSurfaces')

const SEMANTIC_MODEL_PATH = path.join(__dirname, '..', 'assets', 'semanticSearchModel.bin')
const CLOSE_ANIMATION_MS = 300

let activeDisplayId = null
let activeTopBar = null
let hideTimeout = null
let hideTimeoutTopBar = null
let lastUserForeground = 0
let focusReturnTarget = 0
let tookFocus = false
let switcherCloser = null
let emojiCaptureControl = null
let screenshotStarter = null
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

function isLauncherActive(win) {
  return activeTopBar === win
}

function getActiveDisplayId() {
  return activeTopBar ? activeDisplayId : null
}

function finishHide(topBar) {
  if (topBar.isDestroyed()) return
  topBar.webContents.send('launcher/hide')
  if (typeof topBar.restorePassiveTopBar === 'function') topBar.restorePassiveTopBar()
  else topBar.setAlwaysOnTop(false)
  if (typeof topBar.isFocusable !== 'function' || topBar.isFocusable()) topBar.setFocusable(false)
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

function animatedHide(options) {
  if (!activeTopBar || activeTopBar.isDestroyed()) return
  const returnTarget = focusTargetOnHide({
    restoreFocus: Boolean(options && options.restoreFocus),
    tookFocus,
    previousForeground: focusReturnTarget,
  })
  tookFocus = false
  focusReturnTarget = 0
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
  }, CLOSE_ANIMATION_MS)
  if (returnTarget) activateWindow(returnTarget)
}

function hideForOverlay() {
  tookFocus = false
  focusReturnTarget = 0
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
  const topBar = shellSurfaces.topBarForDisplay(displayId)
  if (!topBar) return

  endEmojiCapture()

  try {
    const fg = getForegroundWindow()
    if (fg && !shellSurfaces.isShellSurface(fg)) lastUserForeground = fg
    focusReturnTarget = captureFocusTarget({
      wasActive: Boolean(activeTopBar),
      currentTarget: focusReturnTarget,
      foreground: fg,
      isShellSurface: shellSurfaces.isShellSurface,
    })
  } catch {
    if (!activeTopBar) focusReturnTarget = 0
  }

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
  tookFocus = true
}

function pickDisplay() {
  const { screen } = require('electron')
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function showFromHotkey() {
  if (activeTopBar) {
    animatedHide({ restoreFocus: true })
    return
  }
  showLauncher(pickDisplay().id)
}

function showClipboardHistory() {
  if (activeTopBar) {
    animatedHide({ restoreFocus: true })
    return
  }
  showLauncher(pickDisplay().id, 'clipboard')
}

function showEmoji() {
  if (activeTopBar) {
    animatedHide()
    return
  }
  const display = pickDisplay()
  const topBar = shellSurfaces.topBarForDisplay(display.id)
  if (!topBar) return

  let target = 0
  try {
    const fg = getForegroundWindow()
    if (fg && !shellSurfaces.isShellSurface(fg)) { lastUserForeground = fg; target = fg }
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
  tookFocus = false
  focusReturnTarget = 0
  setEmojiCapture(true, target)
}

function forwardEmojiKey(message) {
  if (!activeTopBar || activeTopBar.isDestroyed()) return
  activeTopBar.webContents.send('emoji/key', message)
}

function setEmojiCaptureControl(fn) {
  emojiCaptureControl = typeof fn === 'function' ? fn : null
}

function handleBlur(topBar) {
  if (activeTopBar !== topBar) return
  animatedHide()
}

function setScreenshotStarter(fn) {
  screenshotStarter = typeof fn === 'function' ? fn : null
}

function hideThen(action) {
  animatedHide()
  return action()
}

function readSemanticModel() {
  try {
    return fs.readFileSync(SEMANTIC_MODEL_PATH)
  } catch (e) {
    console.error('[launcher] semantic model unavailable:', e.message)
    return null
  }
}

function runWindowCommand(action) {
  const hwnd = lastUserForeground
  animatedHide()
  if (!hwnd) return { ok: false }
  if (action === 'minimize') minimizeWindow(hwnd)
  else if (action === 'maximize') maximizeWindow(hwnd)
  else if (action === 'close') closeWindow(hwnd)
  else return { ok: false }
  return { ok: true }
}

module.exports = {
  handlers: {
    'launcher/show': (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const { screen } = require('electron')
      const display = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()
      showLauncher(display.id)
    },
    'launcher/hide': (_event, options) => animatedHide(options),
    'launcher/panel-bottom': (event, bottom) => {
      if (!activeTopBar || activeTopBar.isDestroyed()) return
      if (event.sender !== activeTopBar.webContents) return
      if (typeof bottom !== 'number' || !Number.isFinite(bottom) || bottom <= 0) return
      lastPanelBottom.set(activeDisplayId, bottom)
      if (typeof activeTopBar.setRaisedBounds === 'function') activeTopBar.setRaisedBounds(bottom)
    },
    'launcher/launch': (_event, id) => {
      const item = appCatalog.findItem(id)
      if (!item) return { success: false }
      return hideThen(() => appLaunch.launchItem(item))
    },
    'launcher/launch-admin': (_event, id) => {
      const item = appCatalog.findItem(id)
      if (!item) return { success: false }
      return hideThen(() => appLaunch.launchAdminItem(item))
    },
    'launcher/uninstall': (_event, id) => {
      const item = appCatalog.findItem(id)
      if (!item) return Promise.resolve({ ok: false, mode: 'none' })
      return appLaunch.uninstallItem(item)
    },
    'launcher/end-task': (_event, pid) => {
      animatedHide()
      try { process.kill(pid) } catch {}
      return { success: true }
    },
    'launcher/open-location': (_event, id) => appLaunch.openItemLocation(appCatalog.findItem(id)),
    'launcher/insert-text': async (_event, text) => {
      const hwnd = lastUserForeground
      hideForOverlay()
      if (typeof text !== 'string' || !text) return { ok: false }
      return { ok: await insertText(hwnd, text) }
    },
    'launcher/paste': async () => {
      const hwnd = lastUserForeground
      hideForOverlay()
      return { ok: await pasteInto(hwnd) }
    },
    'launcher/semantic-model': () => readSemanticModel(),
    'launcher/take-screenshot': () => {
      hideForOverlay()
      if (screenshotStarter) screenshotStarter()
    },
    'apps/window-command': (_event, action) => runWindowCommand(action),
  },
  showFromHotkey,
  showEmoji,
  showClipboardHistory,
  forwardEmojiKey,
  setEmojiCaptureControl,
  setScreenshotStarter,
  closeEmoji: animatedHide,
  hideForOverlay,
  setSwitcherCloser,
  getActiveDisplayId,
  isLauncherActive,
  handleBlur,
  start() {
    appActivator.warm()
  },
}

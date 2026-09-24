const displayConfig = require('./displayConfig')
const displayModePolicy = require('./displayModePolicy')

const HIDE_ANIMATION_MS = 300

let shellsRef = null
let displayProvider = null
let otherSurfacesCloser = null
let keyCaptureControl = null
let activeTopBar = null
let pendingRestore = null
let picker = null
let opening = false
let applying = false

function electronScreen() {
  return require('electron').screen
}

function pickDisplay() {
  if (displayProvider) {
    try {
      const display = displayProvider()
      if (display) return display
    } catch (e) {
      console.error('[displayModePicker] display provider error:', e.message)
    }
  }
  const screen = electronScreen()
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function restorePassiveState(topBar) {
  if (topBar.isDestroyed()) return
  if (typeof topBar.restorePassiveTopBar === 'function') topBar.restorePassiveTopBar()
  else topBar.setAlwaysOnTop(false)
}

function flushPendingRestore(keepTopBar) {
  if (!pendingRestore) return
  const { topBar, timer } = pendingRestore
  clearTimeout(timer)
  pendingRestore = null
  if (topBar !== keepTopBar) restorePassiveState(topBar)
}

function setKeyCapture(active) {
  if (!keyCaptureControl) return
  try { keyCaptureControl(active) } catch (e) { console.error('[displayModePicker] key capture error:', e.message) }
}

function sendToPicker(channel, payload) {
  if (activeTopBar && !activeTopBar.isDestroyed()) activeTopBar.webContents.send(channel, payload)
}

async function open() {
  if (activeTopBar || opening || applying || !shellsRef) return
  opening = true
  let displayMode = null
  try {
    displayMode = await displayConfig.readDisplayMode()
  } finally {
    opening = false
  }
  if (!displayMode || activeTopBar) return

  const shell = shellsRef.get(pickDisplay().id)
  if (!shell || shell.topBar.isDestroyed()) return

  const options = displayModePolicy.planDisplayModeOptions(displayMode)
  picker = {
    options,
    currentMode: displayMode.currentMode,
    selectedMode: displayModePolicy.initialDisplayMode(options, displayMode.currentMode),
  }

  activeTopBar = shell.topBar
  flushPendingRestore(activeTopBar)
  if (otherSurfacesCloser) {
    try { otherSurfacesCloser() } catch (e) { console.error('[displayModePicker] closing other surfaces failed:', e.message) }
  }
  activeTopBar.webContents.send('topbar/close-menus')
  activeTopBar.setAlwaysOnTop(true, 'screen-saver')
  activeTopBar.setIgnoreMouseEvents(false)
  setKeyCapture(true)
  sendToPicker('displaymode/show', { ...picker })
}

function hide() {
  picker = null
  setKeyCapture(false)
  const topBar = activeTopBar
  activeTopBar = null
  if (!topBar || topBar.isDestroyed()) return
  topBar.webContents.send('displaymode/hide')
  topBar.setIgnoreMouseEvents(true)
  flushPendingRestore(topBar)
  const timer = setTimeout(() => {
    pendingRestore = null
    restorePassiveState(topBar)
  }, HIDE_ANIMATION_MS)
  pendingRestore = { topBar, timer }
}

function step(direction) {
  if (!picker) return
  picker.selectedMode = displayModePolicy.stepDisplayMode(picker.options, picker.selectedMode, direction)
  sendToPicker('displaymode/selection-changed', picker.selectedMode)
}

function apply(chosenMode) {
  if (!picker) return
  const { options, currentMode } = picker
  const mode = chosenMode ?? picker.selectedMode
  hide()
  if (!displayModePolicy.shouldApplyDisplayMode(options, currentMode, mode)) return
  applying = true
  setTimeout(() => {
    displayConfig.applyDisplayMode(mode).finally(() => { applying = false })
  }, HIDE_ANIMATION_MS)
}

function handleKeyAction(action) {
  if (action === 'next') step(1)
  else if (action === 'previous') step(-1)
  else if (action === 'apply') apply()
  else if (action === 'dismiss') hide()
}

function fromActiveTopBar(event) {
  return Boolean(activeTopBar && !activeTopBar.isDestroyed() && event.sender === activeTopBar.webContents)
}

module.exports = {
  handlers: {
    'displaymode/choose': (event, mode) => {
      if (!fromActiveTopBar(event)) return
      if (!displayModePolicy.DISPLAY_MODES.includes(mode)) return
      apply(mode)
    },
    'displaymode/dismiss': (event) => {
      if (!fromActiveTopBar(event)) return
      hide()
    },
  },

  open,
  hide,
  handleKeyAction,

  isActive(win) {
    return activeTopBar === win
  },

  setShells(shells) {
    shellsRef = shells
  },

  setDisplayProvider(fn) {
    displayProvider = typeof fn === 'function' ? fn : null
  },

  setOtherSurfacesCloser(fn) {
    otherSurfacesCloser = typeof fn === 'function' ? fn : null
  },

  setKeyCaptureControl(fn) {
    keyCaptureControl = typeof fn === 'function' ? fn : null
  },
}

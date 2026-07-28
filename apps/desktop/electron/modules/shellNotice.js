// A single shell-owned surface for "this happened" and "this could not happen" messages.
// Anything in the main process can raise one: a file the shell could not hand to a plugin,
// a shortcut that no longer starts anything, a plugin that is off. The action is supplied by
// whoever raised the notice and runs back in the main process, so callers stay in one place.

const { BrowserWindow, screen } = require('electron')
const path = require('path')

const WIDTH = 380
const MARGIN = 8
const MIN_HEIGHT = 64
const MAX_HEIGHT = 320
const DEFAULT_TIMEOUT_MS = 7000

let viewUrl = null
let loadViewUrl = null
let win = null
let current = null
let currentAction = null
let anchorArea = null
let dismissTimer = null

function configure(options) {
  viewUrl = options && options.url ? options.url : null
  loadViewUrl = options && typeof options.loadUrl === 'function' ? options.loadUrl : null
}

function ensureWindow() {
  if (win && !win.isDestroyed()) return win
  if (!viewUrl || !loadViewUrl) return null
  win = new BrowserWindow({
    width: WIDTH,
    height: MIN_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.on('closed', () => {
    win = null
  })
  loadViewUrl(win, viewUrl)
  return win
}

function place(height) {
  if (!win || win.isDestroyed()) return
  const area = anchorArea || screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  win.setBounds({
    x: Math.round(area.x + (area.width - WIDTH) / 2),
    y: area.y + MARGIN,
    width: WIDTH,
    height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height))),
  })
}

function send(channel, payload) {
  if (!win || win.isDestroyed()) return
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
    })
    return
  }
  win.webContents.send(channel, payload)
}

function clearDismissTimer() {
  if (!dismissTimer) return
  clearTimeout(dismissTimer)
  dismissTimer = null
}

function scheduleDismiss(id, timeoutMs) {
  clearDismissTimer()
  if (timeoutMs === 0) return
  const delay = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  dismissTimer = setTimeout(() => {
    dismissTimer = null
    if (current && current.id === id) hide()
  }, delay)
}

function hide() {
  clearDismissTimer()
  current = null
  currentAction = null
  anchorArea = null
  send('notice/hide')
  if (win && !win.isDestroyed()) win.hide()
}

function show(request) {
  if (!request || typeof request.message !== 'string') return null
  const target = ensureWindow()
  if (!target) return null
  const id = typeof request.id === 'string' && request.id ? request.id : `notice-${Date.now()}`
  const action = request.action && typeof request.action.run === 'function' ? request.action : null
  current = {
    id,
    title: typeof request.title === 'string' ? request.title : null,
    message: request.message,
    tone: request.tone === 'error' || request.tone === 'success' ? request.tone : 'info',
    busy: !!request.busy,
    action: action ? { label: action.label } : null,
  }
  currentAction = action
  if (!target.isVisible()) anchorArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  place(target.getBounds().height)
  send('notice/show', current)
  if (!target.isVisible()) target.showInactive()
  target.setAlwaysOnTop(true, 'screen-saver')
  scheduleDismiss(id, request.timeoutMs)
  return id
}

function dismiss(id) {
  if (id && (!current || current.id !== id)) return
  hide()
}

function runCurrentAction() {
  const action = currentAction
  hide()
  if (!action) return { ok: false }
  try {
    action.run()
  } catch (e) {
    console.error('[notice] action failed:', e && e.message)
    return { ok: false }
  }
  return { ok: true }
}

module.exports = {
  handlers: {
    'notice/current': () => current,
    'notice/size': (_event, height) => {
      if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return { ok: false }
      place(height)
      return { ok: true }
    },
    'notice/action': () => runCurrentAction(),
    'notice/dismiss': () => {
      hide()
      return { ok: true }
    },
  },
  configure,
  show,
  dismiss,
}

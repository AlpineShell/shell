// A single shell-owned surface for "this happened", "this could not happen" and "may I?".
// Anything in the main process can raise one: a file the shell could not hand to a plugin,
// a shortcut that no longer starts anything, a plugin that is off, a plugin asking before it
// changes something. It renders inside the topbar window that already spans the display, so
// there is no second always-on-top window and the reserved work area never moves.

const DEFAULT_TIMEOUT_MS = 7000

let toTopbars = null
let current = null
let currentRequest = null
let pendingAction = null
let pendingConfirm = null
let pendingCancel = null
let dismissTimer = null
let escapeHeld = false
let topbarsRaised = false
let waiting = []

function start(_broadcast, broadcastToTopbars) {
  toTopbars = typeof broadcastToTopbars === 'function' ? broadcastToTopbars : null
}

function send(channel, payload) {
  if (toTopbars) toTopbars(channel, payload)
}

function cursorDisplayId() {
  try {
    const { screen } = require('electron')
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
  } catch {
    return null
  }
}

// A notice is drawn by the topbar, which sits at normal z-order, so anything the user has
// open can cover it. Raise the bars that carry one and put them back afterwards -- the
// restore is the same one the launcher uses, so it declines to lower a bar the launcher or
// alt-tab is still holding up.
function raiseTopbars(raised) {
  if (raised === topbarsRaised) return
  try {
    const { BrowserWindow } = require('electron')
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      let mode = null
      try {
        mode = new URL(win.webContents.getURL()).searchParams.get('mode')
      } catch {
        continue
      }
      if (mode !== 'topbar') continue
      if (raised) win.setAlwaysOnTop(true, 'screen-saver')
      else if (typeof win.restorePassiveTopBar === 'function') win.restorePassiveTopBar()
      else win.setAlwaysOnTop(false)
    }
    topbarsRaised = raised
  } catch {
    topbarsRaised = false
  }
}

// The topbar window is focusable: false, so a question on it can never receive a key press.
// Escape is claimed only while one is waiting for an answer, and released the moment it is not.
function holdEscape(wanted) {
  if (wanted === escapeHeld) return
  try {
    const { globalShortcut } = require('electron')
    if (wanted) escapeHeld = globalShortcut.register('Escape', () => hide())
    else {
      globalShortcut.unregister('Escape')
      escapeHeld = false
    }
  } catch {
    escapeHeld = false
  }
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

function runCallback(label, fn) {
  if (typeof fn !== 'function') return { ok: false }
  try {
    fn()
  } catch (e) {
    console.error(`[notice] ${label} failed:`, e && e.message)
    return { ok: false }
  }
  return { ok: true }
}

function clearCurrent() {
  clearDismissTimer()
  holdEscape(false)
  raiseTopbars(false)
  const abandoned = pendingConfirm ? pendingCancel : null
  current = null
  currentRequest = null
  pendingAction = null
  pendingConfirm = null
  pendingCancel = null
  send('notice/hide')
  if (abandoned) runCallback('cancel', abandoned)
}

function hide() {
  clearCurrent()
  showNextWaiting()
}

function forgetWaiting(id) {
  waiting = waiting.filter((request) => request.id !== id)
}

function waitForTurn(id, request) {
  forgetWaiting(id)
  waiting.push({ ...request, id })
}

function showNextWaiting() {
  if (current) return
  const next = waiting.shift()
  if (next) show(next)
}

function currentNoticeWaitedForTurn() {
  return Boolean(currentRequest && currentRequest.waitForTurn)
}

function mustWaitForCurrentNotice(request, id) {
  if (!request.waitForTurn || !current || current.id === id) return false
  return !currentNoticeWaitedForTurn() || Boolean(pendingConfirm)
}

function returnDisplacedNoticeToLine(id) {
  if (!current || current.id === id || !currentNoticeWaitedForTurn()) return
  waiting.unshift(currentRequest)
}

function show(request) {
  if (!request || typeof request.message !== 'string') return null
  const id = typeof request.id === 'string' && request.id ? request.id : `notice-${Date.now()}`
  if (mustWaitForCurrentNotice(request, id)) {
    waitForTurn(id, request)
    return id
  }
  forgetWaiting(id)
  returnDisplacedNoticeToLine(id)
  currentRequest = { ...request, id }
  const action = request.action && typeof request.action.run === 'function' ? request.action : null
  const confirm = request.confirm && typeof request.confirm.run === 'function' ? request.confirm : null
  const displayId = current && current.id === id ? current.displayId : cursorDisplayId()
  clearDismissTimer()
  pendingAction = action
  pendingConfirm = confirm
  pendingCancel = confirm && typeof confirm.onCancel === 'function' ? confirm.onCancel : null
  current = {
    id,
    displayId,
    title: typeof request.title === 'string' ? request.title : null,
    message: request.message,
    tone: request.tone === 'error' || request.tone === 'success' ? request.tone : 'info',
    busy: !!request.busy,
    pill: !!request.pill && !confirm,
    action: action ? { label: action.label } : null,
    confirm: confirm
      ? {
          label: typeof confirm.label === 'string' && confirm.label ? confirm.label : 'Continue',
          cancelLabel:
            typeof confirm.cancelLabel === 'string' && confirm.cancelLabel ? confirm.cancelLabel : 'Cancel',
        }
      : null,
  }
  send('notice/show', current)
  raiseTopbars(true)
  holdEscape(Boolean(confirm))
  scheduleDismiss(id, confirm ? 0 : request.timeoutMs)
  return id
}

function dismiss(id) {
  if (id) forgetWaiting(id)
  if (id && (!current || current.id !== id)) return
  hide()
}

function runCurrentAction() {
  const action = pendingAction
  clearCurrent()
  const result = action ? runCallback('action', action.run) : { ok: false }
  showNextWaiting()
  return result
}

function runCurrentConfirm() {
  const confirm = pendingConfirm
  pendingConfirm = null
  pendingCancel = null
  clearCurrent()
  const result = confirm ? runCallback('confirm', confirm.run) : { ok: false }
  showNextWaiting()
  return result
}

module.exports = {
  handlers: {
    'notice/current': () => current,
    'notice/action': () => runCurrentAction(),
    'notice/confirm': () => runCurrentConfirm(),
    'notice/dismiss': () => {
      hide()
      return { ok: true }
    },
  },
  start,
  show,
  dismiss,
}

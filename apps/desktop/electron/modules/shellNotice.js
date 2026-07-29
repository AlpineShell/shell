// A single shell-owned surface for "this happened", "this could not happen" and "may I?".
// Anything in the main process can raise one: a file the shell could not hand to a plugin,
// a shortcut that no longer starts anything, a plugin that is off, a plugin asking before it
// changes something. It renders inside the topbar window that already spans the display, so
// there is no second always-on-top window and the reserved work area never moves.

const { screen } = require('electron')

const DEFAULT_TIMEOUT_MS = 7000

let toTopbars = null
let current = null
let pendingAction = null
let pendingConfirm = null
let pendingCancel = null
let dismissTimer = null

function start(_broadcast, broadcastToTopbars) {
  toTopbars = typeof broadcastToTopbars === 'function' ? broadcastToTopbars : null
}

function send(channel, payload) {
  if (toTopbars) toTopbars(channel, payload)
}

function cursorDisplayId() {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
  } catch {
    return null
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

function hide() {
  clearDismissTimer()
  const abandoned = pendingConfirm ? pendingCancel : null
  current = null
  pendingAction = null
  pendingConfirm = null
  pendingCancel = null
  send('notice/hide')
  if (abandoned) runCallback('cancel', abandoned)
}

function show(request) {
  if (!request || typeof request.message !== 'string') return null
  const id = typeof request.id === 'string' && request.id ? request.id : `notice-${Date.now()}`
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
  scheduleDismiss(id, confirm ? 0 : request.timeoutMs)
  return id
}

function dismiss(id) {
  if (id && (!current || current.id !== id)) return
  hide()
}

function runCurrentAction() {
  const action = pendingAction
  hide()
  if (!action) return { ok: false }
  return runCallback('action', action.run)
}

function runCurrentConfirm() {
  const confirm = pendingConfirm
  pendingConfirm = null
  pendingCancel = null
  hide()
  if (!confirm) return { ok: false }
  return runCallback('confirm', confirm.run)
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

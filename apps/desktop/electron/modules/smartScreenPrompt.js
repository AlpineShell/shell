const { raiseTopBar } = require('./topBarZOrder')
const protocol = require('./smartScreenHostProtocol')

const HIDE_ANIMATION_MS = 300
const USER_ACTIONS = new Set(['run', 'norun'])

let shellsRef = null
let displayProvider = null
let otherSurfacesCloser = null
let answerSink = null
let activeTopBar = null
let current = null
let pendingRestore = null
const queue = []

function pickDisplay() {
  if (displayProvider) {
    try {
      const display = displayProvider()
      if (display) return display
    } catch (e) {
      console.error('[smartScreenPrompt] display provider error:', e.message)
    }
  }
  const { screen } = require('electron')
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

function sendAnswer(id, userAction) {
  if (!answerSink) return
  try { answerSink(id, userAction) } catch (e) { console.error('[smartScreenPrompt] answer failed:', e.message) }
}

function topBarForPrompt() {
  if (!shellsRef) return null
  const shell = shellsRef.get(pickDisplay().id)
  if (!shell || shell.topBar.isDestroyed()) return null
  return shell.topBar
}

function showNext() {
  if (current) return
  const next = queue.shift()
  if (!next) return
  const topBar = topBarForPrompt()
  if (!topBar) {
    sendAnswer(next.id, 'norun')
    showNext()
    return
  }
  current = next
  activeTopBar = topBar
  flushPendingRestore(topBar)
  if (otherSurfacesCloser) {
    try { otherSurfacesCloser() } catch (e) { console.error('[smartScreenPrompt] closing other surfaces failed:', e.message) }
  }
  topBar.webContents.send('topbar/close-menus')
  raiseTopBar(topBar)
  topBar.setIgnoreMouseEvents(false)
  topBar.webContents.send('smartscreen/show', { id: next.id, ...next.details })
}

function hideActive() {
  const topBar = activeTopBar
  activeTopBar = null
  current = null
  if (!topBar || topBar.isDestroyed()) return
  topBar.webContents.send('smartscreen/hide')
  topBar.setIgnoreMouseEvents(true)
  flushPendingRestore(topBar)
  const timer = setTimeout(() => {
    pendingRestore = null
    restorePassiveState(topBar)
    showNext()
  }, HIDE_ANIMATION_MS)
  pendingRestore = { topBar, timer }
}

function answer(id, userAction) {
  if (!current || current.id !== id || !USER_ACTIONS.has(userAction)) return
  sendAnswer(id, userAction)
  hideActive()
}

function show(prompt) {
  queue.push({ id: prompt.id, details: protocol.readPromptDetails(prompt.html) })
  if (!pendingRestore) showNext()
}

function declineAll() {
  for (const waiting of queue.splice(0)) sendAnswer(waiting.id, 'norun')
  if (current) answer(current.id, 'norun')
}

function fromActiveTopBar(event) {
  return Boolean(activeTopBar && !activeTopBar.isDestroyed() && event.sender === activeTopBar.webContents)
}

module.exports = {
  handlers: {
    'smartscreen/answer': (event, id, userAction) => {
      if (!fromActiveTopBar(event)) return
      answer(id, userAction)
    },
  },

  show,
  declineAll,

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

  setAnswerSink(fn) {
    answerSink = typeof fn === 'function' ? fn : null
  },
}

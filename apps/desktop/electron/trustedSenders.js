const { acceptsIpcSender } = require('./pageUrls')

const UNTRUSTED_SENDER = 'untrusted-sender'
const SETUP_WINDOW = 'setup'
const SETTINGS_WINDOW = 'settings'

let trustedWindowsAccessor = null
let appLocation = null

function setAppLocation(location) {
  appLocation = location && typeof location === 'object'
    ? { indexPath: location.indexPath || null, devServerUrl: location.devServerUrl || null }
    : null
}

function setTrustedWindowsAccessor(accessor) {
  trustedWindowsAccessor = typeof accessor === 'function' ? accessor : null
}

function isLiveWindow(win) {
  try {
    return Boolean(win) && !win.isDestroyed() && Boolean(win.webContents)
  } catch {
    return false
  }
}

function liveTrustedWindows(windowNames) {
  if (!trustedWindowsAccessor || !Array.isArray(windowNames)) return []
  let windows
  try {
    windows = trustedWindowsAccessor()
  } catch {
    return []
  }
  if (!windows || typeof windows !== 'object') return []
  return windowNames.map((name) => windows[name]).filter(isLiveWindow)
}

function senderIsMainFrame(event) {
  const frame = event.senderFrame
  if (frame === undefined) return true
  if (!frame) return false
  const mainFrame = event.sender && event.sender.mainFrame
  return mainFrame === undefined ? true : frame === mainFrame
}

function isTrustedSender(event, windowNames) {
  const sender = event && event.sender
  if (!sender) return false
  if (!senderIsMainFrame(event)) return false
  return liveTrustedWindows(windowNames).some((win) => win.webContents === sender || (typeof sender.id === 'number' && win.webContents.id === sender.id))
}

function untrustedSenderError() {
  const error = new Error(UNTRUSTED_SENDER)
  error.code = UNTRUSTED_SENDER
  return error
}

function guardHandler(handler, windowNames) {
  return (event, ...args) => {
    if (!isTrustedSender(event, windowNames)) throw untrustedSenderError()
    return handler(event, ...args)
  }
}

function senderUrlOf(event) {
  try {
    const frame = event && event.senderFrame
    return frame && typeof frame.url === 'string' ? frame.url : ''
  } catch {
    return ''
  }
}

function isShellSender(channel, event, request) {
  return acceptsIpcSender(channel, senderUrlOf(event), appLocation, request)
}

function guardShellSender(channel, handler) {
  return (event, ...args) => {
    if (!isShellSender(channel, event, args[0])) {
      console.error(`[ipc] refused '${channel}' from ${senderUrlOf(event) || 'a frame without a url'}`)
      throw untrustedSenderError()
    }
    return handler(event, ...args)
  }
}

function guardHandlers(handlers, windowNames) {
  const guarded = {}
  for (const [channel, handler] of Object.entries(handlers)) {
    guarded[channel] = guardHandler(handler, windowNames)
  }
  return guarded
}

module.exports = {
  UNTRUSTED_SENDER,
  SETUP_WINDOW,
  SETTINGS_WINDOW,
  setTrustedWindowsAccessor,
  setAppLocation,
  isTrustedSender,
  isShellSender,
  guardHandler,
  guardHandlers,
  guardShellSender,
}

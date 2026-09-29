const { acceptsIpcSender } = require('./pageUrls')

const UNTRUSTED_SENDER = 'untrusted-sender'

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

function liveTrustedWindows() {
  if (!trustedWindowsAccessor) return []
  let windows
  try {
    windows = trustedWindowsAccessor()
  } catch {
    return []
  }
  return (Array.isArray(windows) ? windows : []).filter((win) => {
    try {
      return Boolean(win) && !win.isDestroyed() && Boolean(win.webContents)
    } catch {
      return false
    }
  })
}

function senderIsMainFrame(event) {
  const frame = event.senderFrame
  if (frame === undefined) return true
  if (!frame) return false
  const mainFrame = event.sender && event.sender.mainFrame
  return mainFrame === undefined ? true : frame === mainFrame
}

function isTrustedSender(event) {
  const sender = event && event.sender
  if (!sender) return false
  if (!senderIsMainFrame(event)) return false
  return liveTrustedWindows().some((win) => win.webContents === sender || (typeof sender.id === 'number' && win.webContents.id === sender.id))
}

function untrustedSenderError() {
  const error = new Error(UNTRUSTED_SENDER)
  error.code = UNTRUSTED_SENDER
  return error
}

function guardHandler(handler) {
  return (event, ...args) => {
    if (!isTrustedSender(event)) throw untrustedSenderError()
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

function guardHandlers(handlers) {
  const guarded = {}
  for (const [channel, handler] of Object.entries(handlers)) {
    guarded[channel] = guardHandler(handler)
  }
  return guarded
}

module.exports = {
  UNTRUSTED_SENDER,
  setTrustedWindowsAccessor,
  setAppLocation,
  isTrustedSender,
  isShellSender,
  guardHandler,
  guardHandlers,
  guardShellSender,
}

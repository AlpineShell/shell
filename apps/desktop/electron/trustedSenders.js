const UNTRUSTED_SENDER = 'untrusted-sender'

let trustedWindowsAccessor = null

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

function guardHandlers(handlers, { except = [] } = {}) {
  const openChannels = new Set(except)
  const guarded = {}
  for (const [channel, handler] of Object.entries(handlers)) {
    guarded[channel] = openChannels.has(channel) ? handler : guardHandler(handler)
  }
  return guarded
}

module.exports = {
  UNTRUSTED_SENDER,
  setTrustedWindowsAccessor,
  isTrustedSender,
  guardHandler,
  guardHandlers,
}

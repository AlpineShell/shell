const { guardShellSender } = require('./trustedSenders')

const SHELL_PAGE_PROTOCOLS = new Set(['file:', 'http:', 'https:'])
const PAGE_MODE_CACHE_LIMIT = 64

const BROADCAST_CHANNELS_HEARD_BY_PAGE_MODE = new Map([
  ['desktop', new Set(['windows/wallpaper-changed', 'theme/changed'])],
  ['screenshot', new Set(['theme/changed'])],
  ['identify', new Set(['theme/changed'])],
])

const pageModeByUrl = new Map()

function parsePageMode(url) {
  try {
    const parsed = new URL(url)
    if (!SHELL_PAGE_PROTOCOLS.has(parsed.protocol)) return null
    return parsed.searchParams.get('mode')
  } catch {
    return null
  }
}

function pageModeOfUrl(url) {
  if (pageModeByUrl.has(url)) return pageModeByUrl.get(url)
  const mode = parsePageMode(url)
  if (pageModeByUrl.size >= PAGE_MODE_CACHE_LIMIT) pageModeByUrl.clear()
  pageModeByUrl.set(url, mode)
  return mode
}

function pageModeHearsChannel(mode, channel) {
  const heardChannels = BROADCAST_CHANNELS_HEARD_BY_PAGE_MODE.get(mode)
  return !heardChannels || heardChannels.has(channel)
}

function isLiveWindow(win) {
  return !win.isDestroyed() && !win.webContents.isDestroyed()
}

function windowPageMode(win) {
  return pageModeOfUrl(win.webContents.getURL())
}

function allWindows() {
  const { BrowserWindow } = require('electron')
  return BrowserWindow.getAllWindows()
}

function sendToWindowsWhere(acceptsWindow, channel, data) {
  for (const win of allWindows()) {
    if (isLiveWindow(win) && acceptsWindow(win)) win.webContents.send(channel, data)
  }
}

function broadcast(channel, data) {
  sendToWindowsWhere((win) => pageModeHearsChannel(windowPageMode(win), channel), channel, data)
}

function isTopbarWindow(win) {
  return windowPageMode(win) === 'topbar'
}

function broadcastToTopbars(channel, data) {
  sendToWindowsWhere(isTopbarWindow, channel, data)
}

function moduleLabel(handlers) {
  const firstChannel = Object.keys(handlers ?? {})[0]
  const namespace = firstChannel?.split('/')[0]
  return namespace || 'module'
}

function registerHandler(label, channel, handler) {
  try {
    const { ipcMain } = require('electron')
    ipcMain.handle(channel, guardShellSender(channel, handler))
  } catch (e) {
    console.error(`[ipc] ${label} handler register failed for '${channel}':`, e?.message ?? e)
  }
}

function handle(channel, handler) {
  registerHandler('main', channel, handler)
}

function registerHandlers(label, handlers) {
  for (const [channel, handler] of Object.entries(handlers ?? {})) {
    registerHandler(label, channel, handler)
  }
}

let recordFailure = () => {}

function setFailureRecorder(recorder) {
  recordFailure = typeof recorder === 'function' ? recorder : () => {}
}

function reportFailure(kind, label, error) {
  try {
    recordFailure(kind, { label, error })
  } catch {}
}

function replySync(event, channel, read) {
  try {
    event.returnValue = read(event)
  } catch (e) {
    console.error(`[ipc] sync reply for '${channel}' failed:`, e?.message ?? e)
    reportFailure('sync-reply-failed', channel, e)
    event.returnValue = null
  }
}

function answerSync(channel, read) {
  const { ipcMain } = require('electron')
  ipcMain.on(channel, (event) => replySync(event, channel, read))
}

function startModule(label, mod) {
  try {
    const result = mod.start?.(broadcast, broadcastToTopbars)
    if (result && typeof result.catch === 'function') {
      result.catch((e) => {
        console.error(`[ipc] ${label} start rejected:`, e?.message ?? e)
        reportFailure('module-start-failed', label, e)
      })
    }
  } catch (e) {
    console.error(`[ipc] ${label} start failed:`, e?.message ?? e)
    reportFailure('module-start-failed', label, e)
  }
}

function registerModule(mod) {
  const label = moduleLabel(mod.handlers)
  registerHandlers(label, mod.handlers)
  startModule(label, mod)
}

function register(...modules) {
  for (const mod of modules) {
    if (!mod) continue
    registerModule(mod)
  }
}

module.exports = { register, handle, answerSync, setFailureRecorder, broadcast, broadcastToTopbars, parsePageMode, pageModeHearsChannel }

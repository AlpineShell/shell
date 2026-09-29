const { ipcMain, BrowserWindow } = require('electron')
const { guardShellSender } = require('./trustedSenders')

function sendToWindow(win, channel, data) {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    sendToWindow(win, channel, data)
  }
}

function isTopbarWindow(win) {
  try {
    return new URL(win.webContents.getURL()).searchParams.get('mode') === 'topbar'
  } catch {
    return false
  }
}

function broadcastToTopbars(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (isTopbarWindow(win)) sendToWindow(win, channel, data)
  }
}

function moduleLabel(handlers) {
  const firstChannel = Object.keys(handlers ?? {})[0]
  const namespace = firstChannel?.split('/')[0]
  return namespace || 'module'
}

function registerHandler(label, channel, handler) {
  try {
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

function startModule(label, mod) {
  try {
    const result = mod.start?.(broadcast, broadcastToTopbars)
    if (result && typeof result.catch === 'function') {
      result.catch((e) => {
        console.error(`[ipc] ${label} start rejected:`, e?.message ?? e)
      })
    }
  } catch (e) {
    console.error(`[ipc] ${label} start failed:`, e?.message ?? e)
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

module.exports = { register, handle, broadcast, broadcastToTopbars }

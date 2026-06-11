const { ipcMain, BrowserWindow } = require('electron')

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

function moduleLabel(handlers) {
  const firstChannel = Object.keys(handlers ?? {})[0]
  const namespace = firstChannel?.split('/')[0]
  return namespace || 'module'
}

function registerHandler(label, channel, handler) {
  try {
    ipcMain.handle(channel, handler)
  } catch (e) {
    console.error(`[ipc] ${label} handler register failed for '${channel}':`, e?.message ?? e)
  }
}

function registerHandlers(label, handlers) {
  for (const [channel, handler] of Object.entries(handlers ?? {})) {
    registerHandler(label, channel, handler)
  }
}

function startModule(label, mod) {
  try {
    const result = mod.start?.(broadcast)
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

module.exports = { register, broadcast }

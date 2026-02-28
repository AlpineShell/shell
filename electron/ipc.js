const { ipcMain, BrowserWindow } = require('electron')

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
}

function register(...modules) {
  for (const mod of modules) {
    for (const [channel, handler] of Object.entries(mod.handlers ?? {})) {
      ipcMain.handle(channel, handler)
    }
    mod.start?.(broadcast)
  }
}

module.exports = { register, broadcast }

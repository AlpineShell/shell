const { ipcMain, BrowserWindow } = require('electron')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

let lastPath = null

function getWallpaperPath() {
  return new Promise((resolve) => {
    exec(
      `reg query "HKCU\\Control Panel\\Desktop" /v Wallpaper`,
      (err, stdout) => {
        const match = stdout.match(/Wallpaper\s+REG_SZ\s+(.+)/)
        resolve(match ? match[1].trim() : null)
      }
    )
  })
}

function encodeWallpaper(wallpaperPath) {
  if (!wallpaperPath || !fs.existsSync(wallpaperPath)) return null

  const ext = path.extname(wallpaperPath).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  const data = fs.readFileSync(wallpaperPath).toString('base64')
  return `data:${mime};base64,${data}`
}

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
}

function startWatching() {
  setInterval(async () => {
    const currentPath = await getWallpaperPath()
    if (currentPath !== lastPath) {
      lastPath = currentPath
      broadcast('windows/wallpaper-changed', encodeWallpaper(currentPath))
    }
  }, 5000)
}

function registerAll() {
  ipcMain.handle('windows/wallpaper', async () => {
    lastPath = await getWallpaperPath()
    return encodeWallpaper(lastPath)
  })
  startWatching()
}

module.exports = { registerAll }
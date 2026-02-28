const { ipcMain } = require('electron')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

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

async function getWallpaper() {
  const wallpaperPath = await getWallpaperPath()
  if (!wallpaperPath || !fs.existsSync(wallpaperPath)) return null

  const ext = path.extname(wallpaperPath).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  const data = fs.readFileSync(wallpaperPath).toString('base64')
  return `data:${mime};base64,${data}`
}

function registerAll() {
  ipcMain.handle('windows/wallpaper', () => getWallpaper())
}

module.exports = { registerAll }
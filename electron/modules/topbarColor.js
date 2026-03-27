const { nativeImage } = require('electron')
const { exec } = require('child_process')
const fs = require('fs')

let lastColor = null
let lastWallpaperPath = null

function getWallpaperPath() {
  return new Promise((resolve) => {
    exec(
      'reg query "HKCU\\Control Panel\\Desktop" /v Wallpaper',
      (err, stdout) => {
        const match = stdout?.match(/Wallpaper\s+REG_SZ\s+(.+)/)
        resolve(match ? match[1].trim() : null)
      }
    )
  })
}

function extractColor(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null

  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) return null

  const size = image.getSize()
  const resized = image.resize({ width: 64, height: Math.round(64 * size.height / size.width) })
  const bitmap = resized.toBitmap()
  const w = resized.getSize().width
  const h = resized.getSize().height
  const total = w * h

  let r = 0, g = 0, b = 0
  for (let i = 0; i < total; i++) {
    const off = i * 4
    b += bitmap[off]
    g += bitmap[off + 1]
    r += bitmap[off + 2]
  }

  return {
    r: Math.round(r / total),
    g: Math.round(g / total),
    b: Math.round(b / total),
  }
}

function updateColor(broadcast) {
  getWallpaperPath().then((wallpaperPath) => {
    if (wallpaperPath === lastWallpaperPath && lastColor) return
    lastWallpaperPath = wallpaperPath
    const color = extractColor(wallpaperPath)
    if (!color) return
    if (!lastColor || color.r !== lastColor.r || color.g !== lastColor.g || color.b !== lastColor.b) {
      lastColor = color
      broadcast('topbar/color-changed', color)
    }
  })
}

module.exports = {
  handlers: {
    'topbar/color': () => {
      if (lastColor) return lastColor
      return getWallpaperPath().then((p) => {
        lastColor = extractColor(p)
        lastWallpaperPath = p
        return lastColor
      })
    },
  },

  start(broadcast) {
    updateColor(broadcast)
    setInterval(() => updateColor(broadcast), 5000)
  },
}

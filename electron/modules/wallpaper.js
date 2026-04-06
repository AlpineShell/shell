const { exec } = require('child_process')
const { dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const SystemParametersInfoW = user32.func(
  '__stdcall', 'SystemParametersInfoW', 'int',
  ['uint32', 'uint32', 'str16', 'uint32']
)

const SPI_SETDESKWALLPAPER = 0x0014
const SPIF_UPDATEINIFILE = 0x01
const SPIF_SENDCHANGE = 0x02

let lastPath = null
let broadcastFn = null

function getPath() {
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

function encode(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null

  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  const data = fs.readFileSync(filePath).toString('base64')
  return `data:${mime};base64,${data}`
}

function setWallpaper(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false
  const ok = SystemParametersInfoW(
    SPI_SETDESKWALLPAPER,
    0,
    filePath,
    SPIF_UPDATEINIFILE | SPIF_SENDCHANGE
  )
  if (ok) {
    lastPath = filePath
    if (broadcastFn) broadcastFn('windows/wallpaper-changed', encode(filePath))
  }
  return !!ok
}

module.exports = {
  handlers: {
    'windows/wallpaper': async () => {
      lastPath = await getPath()
      return encode(lastPath)
    },
    'windows/wallpaper-set': async (_event, filePath) => {
      return setWallpaper(filePath)
    },
    'windows/wallpaper-pick': async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose wallpaper',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return false
      return setWallpaper(result.filePaths[0])
    },
  },

  start(broadcast) {
    broadcastFn = broadcast
    setInterval(async () => {
      const currentPath = await getPath()
      if (currentPath !== lastPath) {
        lastPath = currentPath
        broadcast('windows/wallpaper-changed', encode(currentPath))
      }
    }, 5000)
  },
}

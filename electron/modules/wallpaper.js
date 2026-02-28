const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

let lastPath = null

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

module.exports = {
  handlers: {
    'windows/wallpaper': async () => {
      lastPath = await getPath()
      return encode(lastPath)
    },
  },

  start(broadcast) {
    setInterval(async () => {
      const currentPath = await getPath()
      if (currentPath !== lastPath) {
        lastPath = currentPath
        broadcast('windows/wallpaper-changed', encode(currentPath))
      }
    }, 5000)
  },
}

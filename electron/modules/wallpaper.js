const { exec } = require('child_process')
const { dialog, app } = require('electron')
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

function getMineDir() {
  return path.join(app.getPath('userData'), 'wallpapers')
}

function getPrefPath() {
  return path.join(app.getPath('userData'), 'wallpaper.json')
}

function savePref(filePath) {
  try {
    fs.writeFileSync(getPrefPath(), JSON.stringify({ path: filePath }))
  } catch (e) {
    console.error('[wallpaper] save pref error:', e.message)
  }
}

function loadPref() {
  try {
    const raw = fs.readFileSync(getPrefPath(), 'utf8')
    const data = JSON.parse(raw)
    return data?.path || null
  } catch {
    return null
  }
}

let persistTimer = null
function persistAsync(filePath) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, filePath, SPIF_UPDATEINIFILE)
  }, 800)
}

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

let cachedEncoded = null
let cachedEncodedPath = null
let cachedEncodedMtime = 0

function encode(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null

  const mtime = fs.statSync(filePath).mtimeMs
  if (cachedEncodedPath === filePath && cachedEncodedMtime === mtime && cachedEncoded) {
    return cachedEncoded
  }

  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  const data = fs.readFileSync(filePath).toString('base64')
  cachedEncoded = `data:${mime};base64,${data}`
  cachedEncodedPath = filePath
  cachedEncodedMtime = mtime
  return cachedEncoded
}

function setWallpaper(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false
  const ok = SystemParametersInfoW(
    SPI_SETDESKWALLPAPER,
    0,
    filePath,
    SPIF_SENDCHANGE
  )
  if (ok) {
    lastPath = filePath
    savePref(filePath)
    persistAsync(filePath)
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
    'windows/wallpaper-presets': async () => {
      const presetsDir = app.isPackaged
        ? path.join(process.resourcesPath, 'wallpapers')
        : path.join(__dirname, '..', '..', 'wallpapers')
      try {
        if (!fs.existsSync(presetsDir)) return []
        const entries = fs.readdirSync(presetsDir)
        const valid = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
        return entries
          .filter((name) => valid.includes(path.extname(name).toLowerCase()))
          .map((name) => {
            const fullPath = path.join(presetsDir, name)
            const dataUrl = encode(fullPath)
            return { name: path.basename(name, path.extname(name)), path: fullPath, thumbnail: dataUrl }
          })
          .filter((p) => p.thumbnail)
      } catch (e) {
        console.error('[wallpaper] presets error:', e.message)
        return []
      }
    },
    'windows/wallpaper-pick': async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose wallpaper',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const sourcePath = result.filePaths[0]
      const minePath = getMineDir()
      try {
        if (!fs.existsSync(minePath)) fs.mkdirSync(minePath, { recursive: true })
        const ext = path.extname(sourcePath)
        const base = path.basename(sourcePath, ext)
        let target = path.join(minePath, `${base}${ext}`)
        let n = 1
        while (fs.existsSync(target)) {
          target = path.join(minePath, `${base} (${n})${ext}`)
          n++
        }
        fs.copyFileSync(sourcePath, target)
        setWallpaper(target)
        return target
      } catch (e) {
        console.error('[wallpaper] pick copy error:', e.message)
        return null
      }
    },
    'windows/wallpaper-mine': async () => {
      const minePath = getMineDir()
      try {
        if (!fs.existsSync(minePath)) return []
        const entries = fs.readdirSync(minePath)
        const valid = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
        return entries
          .filter((name) => valid.includes(path.extname(name).toLowerCase()))
          .map((name) => {
            const fullPath = path.join(minePath, name)
            const stat = fs.statSync(fullPath)
            return {
              name: path.basename(name, path.extname(name)),
              path: fullPath,
              thumbnail: encode(fullPath),
              addedAt: stat.mtimeMs,
            }
          })
          .filter((p) => p.thumbnail)
          .sort((a, b) => b.addedAt - a.addedAt)
      } catch (e) {
        console.error('[wallpaper] mine error:', e.message)
        return []
      }
    },
    'windows/wallpaper-mine-delete': async (_event, filePath) => {
      const minePath = getMineDir()
      const resolved = path.resolve(filePath)
      if (!resolved.startsWith(path.resolve(minePath))) return false
      try {
        if (fs.existsSync(resolved)) fs.unlinkSync(resolved)
        return true
      } catch (e) {
        console.error('[wallpaper] delete error:', e.message)
        return false
      }
    },
  },

  start(broadcast) {
    broadcastFn = broadcast
    const saved = loadPref()
    if (saved && fs.existsSync(saved)) {
      lastPath = saved
      SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, saved, SPIF_SENDCHANGE)
    }
    setInterval(async () => {
      const currentPath = await getPath()
      if (currentPath !== lastPath) {
        lastPath = currentPath
        broadcast('windows/wallpaper-changed', encode(currentPath))
      }
    }, 5000)
  },
}

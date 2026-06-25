const { exec } = require('child_process')
const { dialog, app, ipcMain, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const koffi = require('koffi')

const THUMBNAIL_WIDTH = 400
const thumbnailCache = new Map()

function generateThumbnail(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const mtime = fs.statSync(filePath).mtimeMs
  const cacheKey = `${filePath}:${mtime}`
  const cached = thumbnailCache.get(cacheKey)
  if (cached) return cached
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return null
    const size = img.getSize()
    if (size.width === 0 || size.height === 0) return null
    const targetWidth = Math.min(THUMBNAIL_WIDTH, size.width)
    const resized = img.resize({ width: targetWidth, quality: 'good' })
    const dataUrl = `data:image/jpeg;base64,${resized.toJPEG(75).toString('base64')}`
    thumbnailCache.set(cacheKey, dataUrl)
    return dataUrl
  } catch (e) {
    console.error('[wallpaper] thumbnail error:', e.message)
    return null
  }
}

const yieldTick = () => new Promise((resolve) => setImmediate(resolve))

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
const wallpaperPathListeners = new Set()

function onWallpaperPathChange(listener) {
  wallpaperPathListeners.add(listener)
  return () => wallpaperPathListeners.delete(listener)
}

function notifyWallpaperPathChange(filePath) {
  for (const listener of wallpaperPathListeners) {
    try {
      listener(filePath)
    } catch (e) {
      console.error('[wallpaper] path listener error:', e.message)
    }
  }
}

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

function resolveWallpaperPath() {
  if (lastPath) return Promise.resolve(lastPath)
  return getPath()
}

function encode(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const mtime = fs.statSync(filePath).mtimeMs
  return `alpine-wallpaper://image?p=${encodeURIComponent(filePath)}&v=${mtime}`
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
    notifyWallpaperPathChange(filePath)
  }
  return !!ok
}

module.exports = {
  resolveWallpaperPath,
  handlers: {
    'windows/wallpaper': () => encode(lastPath),
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
        const files = entries.filter((name) => valid.includes(path.extname(name).toLowerCase()))
        const out = []
        for (const name of files) {
          const fullPath = path.join(presetsDir, name)
          const thumbnail = generateThumbnail(fullPath)
          if (!thumbnail) continue
          out.push({
            name: path.basename(name, path.extname(name)),
            path: fullPath,
            thumbnail,
            url: encode(fullPath),
          })
          await yieldTick()
        }
        return out
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
        const files = entries.filter((name) => valid.includes(path.extname(name).toLowerCase()))
        const out = []
        for (const name of files) {
          const fullPath = path.join(minePath, name)
          const stat = fs.statSync(fullPath)
          const thumbnail = generateThumbnail(fullPath)
          if (!thumbnail) continue
          out.push({
            name: path.basename(name, path.extname(name)),
            path: fullPath,
            thumbnail,
            url: encode(fullPath),
            addedAt: stat.mtimeMs,
          })
          await yieldTick()
        }
        return out.sort((a, b) => b.addedAt - a.addedAt)
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

    ipcMain.on('windows/wallpaper-init', (event) => {
      event.returnValue = encode(lastPath)
    })
    setInterval(async () => {
      const currentPath = await getPath()
      if (currentPath !== lastPath) {
        lastPath = currentPath
        broadcast('windows/wallpaper-changed', encode(currentPath))
      }
    }, 5000)
  },
}

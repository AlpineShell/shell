const path = require('path')

const WALLPAPER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']

function isWallpaperFile(name) {
  return WALLPAPER_EXTENSIONS.includes(path.extname(name).toLowerCase())
}

function isInsideDirectory(filePath, directory) {
  const relative = path.relative(path.resolve(directory).toLowerCase(), path.resolve(filePath).toLowerCase())
  if (!relative || path.isAbsolute(relative)) return false
  return relative.split(path.sep)[0] !== '..'
}

function isVersionedPresetPath(wallpaperPath) {
  const parts = path.resolve(wallpaperPath).toLowerCase().split(path.sep).filter(Boolean)
  if (parts.length < 3) return false
  return parts[parts.length - 2] === 'wallpapers' && parts[parts.length - 3] === 'resources'
}

function remapMovedPreset({ wallpaperPath, presetsDir, exists }) {
  if (!wallpaperPath || !presetsDir) return null
  if (isInsideDirectory(wallpaperPath, presetsDir)) return null
  if (!isVersionedPresetPath(wallpaperPath)) return null
  const candidate = path.join(presetsDir, path.basename(wallpaperPath))
  return exists(candidate) ? candidate : null
}

function removedPresetReplacement({ wallpaperPath, presetsDir, presetNames, exists }) {
  if (!wallpaperPath || exists(wallpaperPath)) return null
  if (!isInsideDirectory(wallpaperPath, presetsDir) && !isVersionedPresetPath(wallpaperPath)) return null
  const firstPreset = presetNames.filter(isWallpaperFile).sort()[0]
  return firstPreset ? path.join(presetsDir, firstPreset) : null
}

module.exports = {
  isWallpaperFile,
  isInsideDirectory,
  remapMovedPreset,
  removedPresetReplacement,
}

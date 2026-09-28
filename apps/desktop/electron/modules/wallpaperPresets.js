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

function removedPresetReplacement({ wallpaperPath, presetsDir, presetNames, exists }) {
  if (!wallpaperPath || exists(wallpaperPath)) return null
  if (!isInsideDirectory(wallpaperPath, presetsDir)) return null
  const firstPreset = presetNames.filter(isWallpaperFile).sort()[0]
  return firstPreset ? path.join(presetsDir, firstPreset) : null
}

module.exports = {
  isWallpaperFile,
  isInsideDirectory,
  removedPresetReplacement,
}

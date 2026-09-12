const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const { resolveWallpaperPath, onWallpaperPathChange } = require('./wallpaper')
const { rgbToOklab, oklabToRgb } = require('../oklab')

const STORE_FILE = 'topbar-color.json'

let lastColor = null
let lastWallpaperPath = null
let lastPalette = []
let userOverride = null
let showSearchIcon = false
let mediaShowVisualizer = false
let storePath = null
let broadcastRef = null
const effectiveColorListeners = new Set()

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function loadOverride() {
  try {
    const file = getStorePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (data.color && typeof data.color.r === 'number') {
        userOverride = data.color
      }
      if (typeof data.showSearchIcon === 'boolean') {
        showSearchIcon = data.showSearchIcon
      }
      if (typeof data.mediaShowVisualizer === 'boolean') {
        mediaShowVisualizer = data.mediaShowVisualizer
      }
    }
  } catch (e) {
    console.error('[topbarColor] load error:', e.message)
  }
}

function saveOverride() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify({ color: userOverride, showSearchIcon, mediaShowVisualizer }))
  } catch (e) {
    console.error('[topbarColor] save error:', e.message)
  }
}

function medianCut(pixels, depth) {
  if (depth === 0 || pixels.length === 0) {
    let r = 0, g = 0, b = 0
    for (const p of pixels) { r += p[0]; g += p[1]; b += p[2] }
    const n = pixels.length
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
  }
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
  for (const [r, g, b] of pixels) {
    if (r < minR) minR = r; if (r > maxR) maxR = r
    if (g < minG) minG = g; if (g > maxG) maxG = g
    if (b < minB) minB = b; if (b > maxB) maxB = b
  }
  const rangeR = maxR - minR, rangeG = maxG - minG, rangeB = maxB - minB
  const axis = rangeR >= rangeG && rangeR >= rangeB ? 0 : rangeG >= rangeB ? 1 : 2
  pixels.sort((a, b) => a[axis] - b[axis])
  const mid = Math.floor(pixels.length / 2)
  return [
    medianCut(pixels.slice(0, mid), depth - 1),
    medianCut(pixels.slice(mid), depth - 1),
  ]
}

function flattenClusters(clusters) {
  if (typeof clusters[0] === 'number') return [clusters]
  return [...flattenClusters(clusters[0]), ...flattenClusters(clusters[1])]
}

function pickDominantColor(clusters) {
  let best = null
  let bestChroma = -1
  for (const [r, g, b] of clusters) {
    const [, a, b2] = rgbToOklab(r, g, b)
    const chroma = Math.sqrt(a * a + b2 * b2)
    if (chroma > bestChroma) {
      bestChroma = chroma
      best = [r, g, b]
    }
  }
  return best || clusters[0]
}

function remapToMenuTone(r, g, b) {
  const [L, a, b2] = rgbToOklab(r, g, b)
  const chroma = Math.sqrt(a * a + b2 * b2)
  const hue = Math.atan2(b2, a)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  const isDark = lum < 128

  const targetL = isDark ? 0.22 : 0.88
  const targetChroma = Math.min(chroma, 0.06)
  const newA = Math.cos(hue) * targetChroma
  const newB = Math.sin(hue) * targetChroma

  const [nr, ng, nb] = oklabToRgb(targetL, newA, newB)
  return { r: nr, g: ng, b: nb, darkText: !isDark }
}

function computeDarkText(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b > 128
}

function extractColor(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null

  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) return null

  const origSize = image.getSize()
  const targetW = 64
  const topFraction = 0.25
  const targetH = Math.max(8, Math.round(targetW * (origSize.height * topFraction) / origSize.width))

  const resized = image.resize({ width: targetW, height: targetH })
  const bitmap = resized.toBitmap()
  const w = resized.getSize().width
  const h = resized.getSize().height

  const pixels = []
  for (let i = 0; i < w * h; i++) {
    const off = i * 4
    pixels.push([bitmap[off + 2], bitmap[off + 1], bitmap[off]])
  }

  const clusters = flattenClusters(medianCut(pixels, 4))
  const dominant = pickDominantColor(clusters)
  return { color: remapToMenuTone(dominant[0], dominant[1], dominant[2]), clusters }
}

function buildPalette(clusters) {
  const seen = new Set()
  const palette = []
  for (const [r, g, b] of clusters) {
    const mapped = remapToMenuTone(r, g, b)
    const key = `${mapped.r},${mapped.g},${mapped.b}`
    if (seen.has(key)) continue
    seen.add(key)
    palette.push(mapped)
  }
  return palette
}

function getEffectiveColor() {
  if (userOverride) return userOverride
  return lastColor
}

function onEffectiveColorChange(listener) {
  effectiveColorListeners.add(listener)
  return () => effectiveColorListeners.delete(listener)
}

function notifyEffectiveColorChange() {
  const color = getEffectiveColor()
  if (!color) return
  for (const listener of effectiveColorListeners) {
    try {
      listener(color)
    } catch (e) {
      console.error('[topbarColor] effective colour listener error:', e.message)
    }
  }
}

function applyColorForPath(wallpaperPath, broadcast) {
  if (wallpaperPath === lastWallpaperPath && lastColor) return
  lastWallpaperPath = wallpaperPath
  const result = extractColor(wallpaperPath)
  if (!result) return
  lastPalette = buildPalette(result.clusters)
  const color = result.color
  if (!lastColor || color.r !== lastColor.r || color.g !== lastColor.g || color.b !== lastColor.b) {
    lastColor = color
    if (!userOverride) {
      broadcast('topbar/color-changed', color)
      notifyEffectiveColorChange()
    }
  }
}

function updateColor(broadcast) {
  resolveWallpaperPath().then((wallpaperPath) => applyColorForPath(wallpaperPath, broadcast))
}

module.exports = {
  getEffectiveColor,
  onEffectiveColorChange,
  handlers: {
    'topbar/color': () => {
      if (userOverride) return userOverride
      if (lastColor) return lastColor
      return resolveWallpaperPath().then((p) => {
        const result = extractColor(p)
        if (result) {
          lastColor = result.color
          lastPalette = buildPalette(result.clusters)
          lastWallpaperPath = p
          notifyEffectiveColorChange()
        }
        return userOverride || lastColor
      })
    },
    'topbar/color-override-get': () => userOverride,
    'topbar/color-override-set': (_event, color) => {
      if (color && typeof color.r === 'number') {
        userOverride = { r: color.r, g: color.g, b: color.b, darkText: computeDarkText(color.r, color.g, color.b) }
      } else {
        userOverride = null
      }
      saveOverride()
      const effective = getEffectiveColor()
      if (effective && broadcastRef) broadcastRef('topbar/color-changed', effective)
      notifyEffectiveColorChange()
      return effective
    },
    'topbar/color-palette': () => lastPalette,
    'topbar/search-icon-get': () => showSearchIcon,
    'topbar/search-icon-set': (_event, value) => {
      showSearchIcon = !!value
      saveOverride()
      if (broadcastRef) broadcastRef('topbar/search-icon-changed', showSearchIcon)
      return showSearchIcon
    },
    'topbar/media-visualizer-get': () => mediaShowVisualizer,
    'topbar/media-visualizer-set': (_event, value) => {
      mediaShowVisualizer = !!value
      saveOverride()
      if (broadcastRef) broadcastRef('topbar/media-visualizer-changed', mediaShowVisualizer)
      return mediaShowVisualizer
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    loadOverride()
    updateColor(broadcast)
    onWallpaperPathChange((wallpaperPath) => applyColorForPath(wallpaperPath, broadcast))
  },
}

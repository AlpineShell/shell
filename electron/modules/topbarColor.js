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

function rgbToOklab(r, g, b) {
  const lr = (r / 255) ** 2.2
  const lg = (g / 255) ** 2.2
  const lb = (b / 255) ** 2.2
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  return [
    Math.max(0, Math.min(255, Math.round((Math.max(0, lr) ** (1 / 2.2)) * 255))),
    Math.max(0, Math.min(255, Math.round((Math.max(0, lg) ** (1 / 2.2)) * 255))),
    Math.max(0, Math.min(255, Math.round((Math.max(0, lb) ** (1 / 2.2)) * 255))),
  ]
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
  return remapToMenuTone(dominant[0], dominant[1], dominant[2])
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

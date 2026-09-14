const { rgbToOklab, oklabToRgb } = require('../oklab')

const DEFAULT_THEME = 'dark'

const GROUND_LIGHTNESS = {
  light: 0.88,
  dark: 0.22,
}
const GROUND_CHROMA_LIMIT = 0.06

const CAPTION_SYMBOL_COLORS = {
  light: '#000000',
  dark: '#ffffff',
}

let broadcast = null
let lastBroadcast = null
let topbarColorSource = null
const themeChangeListeners = new Set()

function toHex(channels) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function mutedTintAxes(tint) {
  if (!tint) return [0, 0]
  const [, a, b] = rgbToOklab(tint.r, tint.g, tint.b)
  const chroma = Math.hypot(a, b)
  if (chroma <= GROUND_CHROMA_LIMIT) return [a, b]
  return [(a * GROUND_CHROMA_LIMIT) / chroma, (b * GROUND_CHROMA_LIMIT) / chroma]
}

function windowBackgroundFor(name, tint) {
  const lightness = GROUND_LIGHTNESS[name] ?? GROUND_LIGHTNESS[DEFAULT_THEME]
  const [a, b] = mutedTintAxes(tint)
  return toHex(oklabToRgb(lightness, a, b))
}

function readTopbarColor() {
  try {
    return (topbarColorSource && topbarColorSource.getEffectiveColor()) || null
  } catch {
    return null
  }
}

function readTopbarThemeName() {
  const color = readTopbarColor()
  if (!color) return DEFAULT_THEME
  return color.darkText ? 'light' : 'dark'
}

function getTheme() {
  const name = readTopbarThemeName()
  return { name, background: windowBackgroundFor(name, readTopbarColor()) }
}

function getWindowBackground() {
  return getTheme().background
}

function getTitleBarOverlayColors() {
  const { name, background } = getTheme()
  return { color: background, symbolColor: CAPTION_SYMBOL_COLORS[name] }
}

function applyNativeThemeSource(name) {
  try {
    const { nativeTheme } = require('electron')
    nativeTheme.themeSource = name
  } catch {}
}

function onThemeChange(listener) {
  themeChangeListeners.add(listener)
  return () => themeChangeListeners.delete(listener)
}

function notifyThemeChange(theme) {
  for (const listener of themeChangeListeners) {
    try {
      listener(theme)
    } catch (e) {
      console.error('[theme] change listener error:', e.message)
    }
  }
}

function matchesLastBroadcast(theme) {
  if (!lastBroadcast) return false
  return lastBroadcast.name === theme.name && lastBroadcast.background === theme.background
}

function publishIfChanged() {
  const theme = getTheme()
  applyNativeThemeSource(theme.name)
  if (matchesLastBroadcast(theme)) return
  lastBroadcast = theme
  if (broadcast) broadcast('theme/changed', theme)
  notifyThemeChange(theme)
}

function followTopbarColor(source) {
  topbarColorSource = source
  source.onEffectiveColorChange(publishIfChanged)
  publishIfChanged()
}

module.exports = {
  windowBackgroundFor,
  getTheme,
  getWindowBackground,
  getTitleBarOverlayColors,
  onThemeChange,
  followTopbarColor,
  handlers: {
    'theme/get': () => getTheme(),
  },
  start(b) {
    broadcast = b
    const { ipcMain } = require('electron')
    lastBroadcast = getTheme()
    applyNativeThemeSource(lastBroadcast.name)
    ipcMain.on('theme/init', (event) => {
      event.returnValue = getTheme()
    })
  },
}

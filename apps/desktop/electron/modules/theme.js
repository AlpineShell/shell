const fs = require('fs')
const path = require('path')
const { rgbToOklab, oklabToRgb } = require('../oklab')

const STORE_FILE = 'theme.json'
const DEFAULT_THEME = 'dark'
const DEFAULT_PREFERENCE = 'topbar'
const THEME_PREFERENCES = ['topbar', 'system', 'light', 'dark']

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
let preference = DEFAULT_PREFERENCE
let loadedPreference = false
let storePath = null
let topbarColorSource = null
const themeChangeListeners = new Set()

function resolveThemeName(shouldUseDarkColors) {
  return shouldUseDarkColors ? 'dark' : 'light'
}

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

function toThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : DEFAULT_PREFERENCE
}

function getStorePath() {
  if (!storePath) {
    const { app } = require('electron')
    storePath = path.join(app.getPath('userData'), STORE_FILE)
  }
  return storePath
}

function load() {
  preference = DEFAULT_PREFERENCE
}

function save() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify({ preference }, null, 2))
  } catch (e) {
    console.error('[theme] save error:', e.message)
  }
}

function applyPreference() {
  try {
    const { nativeTheme } = require('electron')
    nativeTheme.themeSource = preference === 'topbar' ? readTopbarThemeName() : preference
  } catch {}
}

function ensureLoaded() {
  if (loadedPreference) return
  loadedPreference = true
  load()
  applyPreference()
}

function readSystemThemeName() {
  try {
    const { nativeTheme } = require('electron')
    return resolveThemeName(nativeTheme.shouldUseDarkColors)
  } catch {
    return DEFAULT_THEME
  }
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

function readResolvedThemeName() {
  if (preference === 'topbar') return readTopbarThemeName()
  if (preference === 'system') return readSystemThemeName()
  return preference
}

function refreshResolvedTheme() {
  ensureLoaded()
  applyPreference()
  publishIfChanged()
}

function followTopbarColor(source) {
  topbarColorSource = source
  source.onEffectiveColorChange(refreshResolvedTheme)
  refreshResolvedTheme()
}

function getTheme() {
  ensureLoaded()
  const name = readResolvedThemeName()
  return { name, background: windowBackgroundFor(name, readTopbarColor()), preference }
}

function getWindowBackground() {
  return getTheme().background
}

function getTitleBarOverlayColors() {
  const { name, background } = getTheme()
  return { color: background, symbolColor: CAPTION_SYMBOL_COLORS[name] }
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
  return (
    lastBroadcast.name === theme.name &&
    lastBroadcast.background === theme.background &&
    lastBroadcast.preference === theme.preference
  )
}

function publishIfChanged() {
  const theme = getTheme()
  if (matchesLastBroadcast(theme)) return
  lastBroadcast = theme
  if (broadcast) broadcast('theme/changed', theme)
  notifyThemeChange(theme)
}

function setPreference() {
  ensureLoaded()
  preference = DEFAULT_PREFERENCE
  save()
  applyPreference()
  publishIfChanged()
  return getTheme()
}

module.exports = {
  resolveThemeName,
  windowBackgroundFor,
  toThemePreference,
  getTheme,
  getWindowBackground,
  getTitleBarOverlayColors,
  onThemeChange,
  followTopbarColor,
  handlers: {
    'theme/get': () => getTheme(),
    'theme/set-preference': () => setPreference(),
  },
  start(b) {
    broadcast = b
    const { ipcMain, nativeTheme } = require('electron')
    lastBroadcast = getTheme()
    ipcMain.on('theme/init', (event) => {
      event.returnValue = getTheme()
    })
    nativeTheme.on('updated', publishIfChanged)
  },
}

const { DEFAULT_TOPBAR_COLOR } = require('./topbarColorDefaults')

const CAPTION_SYMBOL_COLORS = {
  light: '#000000',
  dark: '#ffffff',
}

let broadcast = null
let lastBroadcast = null
let ridgeColorSource = null
const themeChangeListeners = new Set()

function hexChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
}

function hexFor(color) {
  return `#${hexChannel(color.r)}${hexChannel(color.g)}${hexChannel(color.b)}`
}

function themeFor(color) {
  return { name: color.darkText ? 'light' : 'dark', background: hexFor(color) }
}

function currentRidgeColor() {
  const color = ridgeColorSource ? ridgeColorSource.currentColor() : null
  return color || DEFAULT_TOPBAR_COLOR
}

function getTheme() {
  return themeFor(currentRidgeColor())
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
  return lastBroadcast.name === theme.name && lastBroadcast.background === theme.background
}

function publishIfChanged() {
  const theme = getTheme()
  if (matchesLastBroadcast(theme)) return
  lastBroadcast = theme
  if (broadcast) broadcast('theme/changed', theme)
  notifyThemeChange(theme)
}

function followRidgeColor(source) {
  ridgeColorSource = source
  source.onColorChange(publishIfChanged)
  publishIfChanged()
}

module.exports = {
  themeFor,
  getTheme,
  getWindowBackground,
  getTitleBarOverlayColors,
  followRidgeColor,
  onThemeChange,
  handlers: {
    'theme/get': () => getTheme(),
  },
  start(b) {
    broadcast = b
    const { ipcMain } = require('electron')
    lastBroadcast = getTheme()
    ipcMain.on('theme/init', (event) => {
      event.returnValue = getTheme()
    })
  },
}

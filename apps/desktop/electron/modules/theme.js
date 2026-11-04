const GROUND_COLORS = {
  light: '#f7f7f7',
  dark: '#1f2020',
}

const CAPTION_SYMBOL_COLORS = {
  light: '#000000',
  dark: '#ffffff',
}

let broadcast = null
let lastBroadcast = null
let colorModeSource = null
const themeChangeListeners = new Set()

function themeFor(colorMode) {
  const name = colorMode === 'light' ? 'light' : 'dark'
  return { name, background: GROUND_COLORS[name] }
}

function currentColorMode() {
  return colorModeSource ? colorModeSource.currentColorMode() : 'dark'
}

function getTheme() {
  return themeFor(currentColorMode())
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

function followColorMode(source) {
  colorModeSource = source
  source.onColorModeChange(publishIfChanged)
  publishIfChanged()
}

module.exports = {
  themeFor,
  getTheme,
  getWindowBackground,
  getTitleBarOverlayColors,
  followColorMode,
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

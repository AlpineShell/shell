const DEFAULT_THEME = 'dark'

const WINDOW_BACKGROUNDS = {
  light: '#d6d6d6',
  dark: '#202020',
}

const CAPTION_SYMBOL_COLORS = {
  light: '#000000',
  dark: '#ffffff',
}

let broadcast = null
let lastBroadcast = null
const themeChangeListeners = new Set()

function windowBackgroundFor(name) {
  return WINDOW_BACKGROUNDS[name] ?? WINDOW_BACKGROUNDS[DEFAULT_THEME]
}

function readWindowsThemeName() {
  try {
    const { nativeTheme } = require('electron')
    if (!nativeTheme) return DEFAULT_THEME
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  } catch {
    return DEFAULT_THEME
  }
}

function getTheme() {
  const name = readWindowsThemeName()
  return { name, background: windowBackgroundFor(name) }
}

function getWindowBackground() {
  return getTheme().background
}

function getTitleBarOverlayColors() {
  const { name, background } = getTheme()
  return { color: background, symbolColor: CAPTION_SYMBOL_COLORS[name] }
}

function followWindowsTheme() {
  try {
    const { nativeTheme } = require('electron')
    if (!nativeTheme) return
    nativeTheme.on('updated', publishIfChanged)
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
  if (matchesLastBroadcast(theme)) return
  lastBroadcast = theme
  if (broadcast) broadcast('theme/changed', theme)
  notifyThemeChange(theme)
}

module.exports = {
  windowBackgroundFor,
  getTheme,
  getWindowBackground,
  getTitleBarOverlayColors,
  onThemeChange,
  handlers: {
    'theme/get': () => getTheme(),
  },
  start(b) {
    broadcast = b
    const { ipcMain } = require('electron')
    followWindowsTheme()
    lastBroadcast = getTheme()
    ipcMain.on('theme/init', (event) => {
      event.returnValue = getTheme()
    })
  },
}

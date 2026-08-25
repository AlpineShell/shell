const DEFAULT_THEME = 'dark'

const WINDOW_BACKGROUNDS = {
  light: '#f9fafb',
  dark: '#1a1a19',
}

let broadcast = null
let lastBroadcastName = null

function resolveThemeName(shouldUseDarkColors) {
  return shouldUseDarkColors ? 'dark' : 'light'
}

function windowBackgroundFor(name) {
  return WINDOW_BACKGROUNDS[name] || WINDOW_BACKGROUNDS[DEFAULT_THEME]
}

function readSystemThemeName() {
  try {
    const { nativeTheme } = require('electron')
    return resolveThemeName(nativeTheme.shouldUseDarkColors)
  } catch {
    return DEFAULT_THEME
  }
}

function getTheme() {
  const name = readSystemThemeName()
  return { name, background: windowBackgroundFor(name) }
}

function getWindowBackground() {
  return windowBackgroundFor(readSystemThemeName())
}

function publishIfChanged() {
  const theme = getTheme()
  if (theme.name === lastBroadcastName) return
  lastBroadcastName = theme.name
  if (broadcast) broadcast('theme/changed', theme)
}

module.exports = {
  resolveThemeName,
  windowBackgroundFor,
  getTheme,
  getWindowBackground,
  handlers: {
    'theme/get': () => getTheme(),
  },
  start(b) {
    broadcast = b
    const { ipcMain, nativeTheme } = require('electron')
    lastBroadcastName = getTheme().name
    ipcMain.on('theme/init', (event) => {
      event.returnValue = getTheme()
    })
    nativeTheme.on('updated', publishIfChanged)
  },
}

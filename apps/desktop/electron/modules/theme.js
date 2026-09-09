const fs = require('fs')
const path = require('path')

const STORE_FILE = 'theme.json'
const DEFAULT_THEME = 'dark'
const DEFAULT_PREFERENCE = 'system'
const THEME_PREFERENCES = ['system', 'light', 'dark']

const WINDOW_BACKGROUNDS = {
  light: '#f9fafb',
  dark: '#1a1a19',
}

let broadcast = null
let lastBroadcast = null
let preference = DEFAULT_PREFERENCE
let loadedPreference = false
let storePath = null

function resolveThemeName(shouldUseDarkColors) {
  return shouldUseDarkColors ? 'dark' : 'light'
}

function windowBackgroundFor(name) {
  return WINDOW_BACKGROUNDS[name] || WINDOW_BACKGROUNDS[DEFAULT_THEME]
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
  try {
    const file = getStorePath()
    if (!fs.existsSync(file)) return
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    preference = toThemePreference(data.preference)
  } catch (e) {
    console.error('[theme] load error:', e.message)
  }
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
    nativeTheme.themeSource = preference
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

function readResolvedThemeName() {
  return preference === 'system' ? readSystemThemeName() : preference
}

function getTheme() {
  ensureLoaded()
  const name = readResolvedThemeName()
  return { name, background: windowBackgroundFor(name), preference }
}

function getWindowBackground() {
  return getTheme().background
}

function matchesLastBroadcast(theme) {
  if (!lastBroadcast) return false
  return lastBroadcast.name === theme.name && lastBroadcast.preference === theme.preference
}

function publishIfChanged() {
  const theme = getTheme()
  if (matchesLastBroadcast(theme)) return
  lastBroadcast = theme
  if (broadcast) broadcast('theme/changed', theme)
}

function setPreference(value) {
  ensureLoaded()
  preference = toThemePreference(value)
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
  handlers: {
    'theme/get': () => getTheme(),
    'theme/set-preference': (_event, value) => setPreference(value),
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

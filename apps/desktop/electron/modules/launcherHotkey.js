const path = require('path')
const fs = require('fs')

const DEFAULT_HOTKEY = 'Win'
const STORE_FILE = 'launcher-hotkey.json'

let storePath = null
let currentHotkey = DEFAULT_HOTKEY
let triggerCallback = null
let broadcast = null

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
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof data.hotkey === 'string' && data.hotkey.length > 0) {
        currentHotkey = data.hotkey
      }
    }
  } catch (e) {
    console.error('[launcherHotkey] load error:', e.message)
  }
}

function save() {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ hotkey: currentHotkey }, null, 2))
  } catch (e) {
    console.error('[launcherHotkey] save error:', e.message)
  }
}

function shellHotkeys() {
  return require('./shellHotkeys')
}

function setWinLauncher(enabled) {
  shellHotkeys().setWinTapEnabled(enabled)
}

function clearAll() {
  const { globalShortcut } = require('electron')
  globalShortcut.unregisterAll()
  setWinLauncher(false)
}

function bind(hotkey) {
  const { globalShortcut } = require('electron')
  if (hotkey === DEFAULT_HOTKEY) {
    setWinLauncher(true)
    return true
  }
  try {
    return globalShortcut.register(hotkey, () => {
      if (triggerCallback) triggerCallback()
    })
  } catch (e) {
    console.error('[launcherHotkey] register error:', e.message)
    return false
  }
}

function applyHotkey(hotkey) {
  clearAll()
  return bind(hotkey)
}

function rebind(current, requested, apply) {
  const wanted = requested || DEFAULT_HOTKEY
  if (wanted === current) return { ok: true, hotkey: current }
  if (apply(wanted)) return { ok: true, hotkey: wanted }
  apply(current)
  return { ok: false, hotkey: current }
}

function setHotkey(hotkey) {
  const result = rebind(currentHotkey, hotkey, applyHotkey)
  if (!result.ok) {
    console.error('[launcherHotkey] refused, kept:', result.hotkey)
    return result
  }
  if (result.hotkey !== currentHotkey) {
    currentHotkey = result.hotkey
    save()
    if (broadcast) broadcast('launcher/hotkey-changed', currentHotkey)
  }
  return result
}

function setTriggerCallback(cb) {
  triggerCallback = cb
  shellHotkeys().on('winTap', () => {
    if (triggerCallback) triggerCallback()
  })
}

module.exports = {
  handlers: {
    'launcher/hotkey-get': () => currentHotkey,
    'launcher/hotkey-set': (_event, hotkey) => setHotkey(hotkey),
    'launcher/hotkey-default': () => DEFAULT_HOTKEY,
  },
  rebind,
  setTriggerCallback,
  start(b) {
    const { app, globalShortcut } = require('electron')
    broadcast = b
    load()
    app.whenReady().then(() => applyHotkey(currentHotkey))
    app.on('will-quit', () => globalShortcut.unregisterAll())
  },
}

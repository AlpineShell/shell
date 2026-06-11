const { app, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')

const DEFAULT_HOTKEY = 'Win'
const STORE_FILE = 'launcher-hotkey.json'

let storePath = null
let currentHotkey = DEFAULT_HOTKEY
let triggerCallback = null
let altTabModule = null
let broadcast = null

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
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

function clearAll() {
  globalShortcut.unregisterAll()
  if (altTabModule && altTabModule.setWinLauncherEnabled) {
    altTabModule.setWinLauncherEnabled(false)
  }
}

function applyHotkey() {
  clearAll()
  if (!currentHotkey) return

  if (currentHotkey === 'Win') {
    if (altTabModule && altTabModule.setWinLauncherEnabled) {
      altTabModule.setWinLauncherEnabled(true)
    }
    return
  }

  try {
    const ok = globalShortcut.register(currentHotkey, () => {
      if (triggerCallback) triggerCallback()
    })
    if (!ok) {
      console.error('[launcherHotkey] register returned false for:', currentHotkey)
    }
  } catch (e) {
    console.error('[launcherHotkey] register error:', e.message)
  }
}

function setHotkey(hotkey) {
  currentHotkey = hotkey || DEFAULT_HOTKEY
  save()
  applyHotkey()
  if (broadcast) broadcast('launcher/hotkey-changed', currentHotkey)
}

function setTriggerCallback(cb) {
  triggerCallback = cb
  if (altTabModule && altTabModule.onWinLauncher) {
    altTabModule.onWinLauncher(() => {
      if (triggerCallback) triggerCallback()
    })
  }
}

function setAltTabModule(mod) {
  altTabModule = mod
  if (triggerCallback && altTabModule && altTabModule.onWinLauncher) {
    altTabModule.onWinLauncher(() => {
      if (triggerCallback) triggerCallback()
    })
  }
}

module.exports = {
  handlers: {
    'launcher/hotkey-get': () => currentHotkey,
    'launcher/hotkey-set': (_event, hotkey) => {
      setHotkey(hotkey)
      return currentHotkey
    },
    'launcher/hotkey-default': () => DEFAULT_HOTKEY,
  },
  setTriggerCallback,
  setAltTabModule,
  start(b) {
    broadcast = b
    load()
    app.whenReady().then(() => applyHotkey())
    app.on('will-quit', () => globalShortcut.unregisterAll())
  },
}

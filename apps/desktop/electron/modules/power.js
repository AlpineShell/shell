const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

const STORE_FILE = 'power-prefs.json'
const CONFIRM_ACTIONS_BY_DEFAULT = true

let confirmActions = CONFIRM_ACTIONS_BY_DEFAULT
let storePath = null
let broadcastRef = null

function getStorePath() {
  if (!storePath) {
    const { app } = require('electron')
    storePath = path.join(app.getPath('userData'), STORE_FILE)
  }
  return storePath
}

function powerAction(action) {
  switch (action) {
    case 'shutdown':
      exec('shutdown /s /t 0')
      break
    case 'restart':
      exec('shutdown /r /t 0')
      break
    case 'logout':
      exec('shutdown /l')
      break
  }
}

function load() {
  try {
    const file = getStorePath()
    if (!fs.existsSync(file)) return
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof data?.confirmActions === 'boolean') confirmActions = data.confirmActions
  } catch (e) {
    console.error('[power] load error:', e.message)
  }
}

function save() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify({ confirmActions }, null, 2))
  } catch (e) {
    console.error('[power] save error:', e.message)
  }
}

function setConfirmActions(value) {
  if (typeof value !== 'boolean') return confirmActions
  confirmActions = value
  save()
  if (broadcastRef) broadcastRef('system/power-confirm-changed', confirmActions)
  return confirmActions
}

function announceResume(broadcast) {
  const { powerMonitor } = require('electron')
  const notify = () => broadcast('system/resume')
  for (const event of ['resume', 'unlock-screen']) {
    try {
      powerMonitor.on(event, notify)
    } catch (e) {
      console.error(`[power] cannot subscribe to '${event}':`, e?.message ?? e)
    }
  }
}

module.exports = {
  handlers: {
    'system/power-action': (_event, action) => powerAction(action),
    'system/power-confirm-get': () => confirmActions,
    'system/power-confirm-set': (_event, value) => setConfirmActions(value),
  },

  start(broadcast) {
    broadcastRef = broadcast
    load()
    announceResume(broadcast)
  },
}

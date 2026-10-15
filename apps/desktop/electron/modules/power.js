const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

const STORE_FILE = 'power-prefs.json'
const CONFIRM_ACTIONS_BY_DEFAULT = true
const SHOW_HIBERNATE_BY_DEFAULT = true
const TURN_ON_HIBERNATION_COMMAND = `powershell -NoProfile -Command "$elevated = Start-Process powercfg -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '/hibernate','on' -ErrorAction Stop; exit $elevated.ExitCode"`

let confirmActions = CONFIRM_ACTIONS_BY_DEFAULT
let showHibernate = SHOW_HIBERNATE_BY_DEFAULT
let storePath = null
let broadcastRef = null

function getStorePath() {
  if (!storePath) {
    const { app } = require('electron')
    storePath = path.join(app.getPath('userData'), STORE_FILE)
  }
  return storePath
}

function lockWorkstation() {
  const koffi = require('koffi')
  const LockWorkStation = koffi.load('user32.dll').func('__stdcall', 'LockWorkStation', 'int', [])
  if (!LockWorkStation()) console.error('[power] LockWorkStation failed')
}

function loadPowrprof() {
  const koffi = require('koffi')
  return koffi.load('powrprof.dll')
}

function suspend({ hibernate }) {
  const SetSuspendState = loadPowrprof().func('__stdcall', 'SetSuspendState', 'uint8', ['uint8', 'uint8', 'uint8'])
  if (!SetSuspendState(hibernate ? 1 : 0, 0, 0)) console.error('[power] SetSuspendState failed')
}

function isHibernateAllowed() {
  try {
    const IsPwrHibernateAllowed = loadPowrprof().func('__stdcall', 'IsPwrHibernateAllowed', 'uint8', [])
    return !!IsPwrHibernateAllowed()
  } catch (e) {
    console.error('[power] IsPwrHibernateAllowed failed:', e.message)
    return false
  }
}

function turnOnHibernation() {
  return new Promise((resolve) => {
    exec(TURN_ON_HIBERNATION_COMMAND, { windowsHide: true }, (err) => {
      if (err) console.error('[power] turning on hibernation failed:', err.message)
      resolve()
    })
  })
}

function hibernate() {
  if (isHibernateAllowed()) suspend({ hibernate: true })
}

function hibernateShown() {
  return showHibernate && isHibernateAllowed()
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
    case 'lock':
      lockWorkstation()
      break
    case 'sleep':
      suspend({ hibernate: false })
      break
    case 'hibernate':
      hibernate()
      break
  }
}

function load() {
  try {
    const file = getStorePath()
    if (!fs.existsSync(file)) return
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof data?.confirmActions === 'boolean') confirmActions = data.confirmActions
    if (typeof data?.showHibernate === 'boolean') showHibernate = data.showHibernate
  } catch (e) {
    console.error('[power] load error:', e.message)
  }
}

function save() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify({ confirmActions, showHibernate }, null, 2))
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

async function setShowHibernate(value) {
  if (typeof value !== 'boolean') return hibernateShown()
  if (value && !isHibernateAllowed()) await turnOnHibernation()
  showHibernate = value && isHibernateAllowed()
  save()
  if (broadcastRef) broadcastRef('system/power-show-hibernate-changed', showHibernate)
  return showHibernate
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
    'system/power-show-hibernate-get': () => hibernateShown(),
    'system/power-show-hibernate-set': (_event, value) => setShowHibernate(value),
  },

  start(broadcast) {
    broadcastRef = broadcast
    load()
    announceResume(broadcast)
  },
}

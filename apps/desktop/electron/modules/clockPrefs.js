const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { runPowerShell } = require('../powershell')
const { answerSync } = require('../ipc')

const STORE_FILE = 'clock-prefs.json'
const TIME_FORMATS = ['auto', '12h', '24h']
const DAY_COUNTS = [1, 2, 3]

let storePath = null
let broadcast = null

let timeFormat = 'auto'
let calendarDays = 1
let showTasks = true
let systemTimeFormat = '24h'

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function guessSystemTimeFormat() {
  try {
    const sample = new Date(2020, 0, 1, 13, 0, 0).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return /[ap]\.?m/i.test(sample) ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

function parseShortTimePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern) return null
  if (pattern.includes('H')) return '24h'
  if (pattern.includes('h')) return '12h'
  return null
}

function getPrefs() {
  return { timeFormat, calendarDays, showTasks, systemTimeFormat }
}

function load() {
  systemTimeFormat = guessSystemTimeFormat()
  try {
    const file = getStorePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (TIME_FORMATS.includes(data.timeFormat)) timeFormat = data.timeFormat
      if (DAY_COUNTS.includes(data.calendarDays)) calendarDays = data.calendarDays
      if (typeof data.showTasks === 'boolean') showTasks = data.showTasks
    }
  } catch (e) {
    console.error('[clockPrefs] load error:', e.message)
  }
}

function save() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify({ timeFormat, calendarDays, showTasks }, null, 2))
  } catch (e) {
    console.error('[clockPrefs] save error:', e.message)
  }
}

function applyPartial(partial) {
  if (!partial || typeof partial !== 'object') return
  if (TIME_FORMATS.includes(partial.timeFormat)) timeFormat = partial.timeFormat
  if (DAY_COUNTS.includes(partial.calendarDays)) calendarDays = partial.calendarDays
  if (typeof partial.showTasks === 'boolean') showTasks = partial.showTasks
}

async function detectSystemTimeFormat() {
  const pattern = await runPowerShell('(Get-Culture).DateTimeFormat.ShortTimePattern')
  const detected = parseShortTimePattern(pattern)
  if (detected && detected !== systemTimeFormat) {
    systemTimeFormat = detected
    if (broadcast) broadcast('clock/prefs-changed', getPrefs())
  }
}

module.exports = {
  handlers: {
    'clock/prefs-get': () => getPrefs(),
    'clock/prefs-set': (_event, partial) => {
      applyPartial(partial)
      save()
      if (broadcast) broadcast('clock/prefs-changed', getPrefs())
      return getPrefs()
    },
  },
  start(b) {
    broadcast = b
    answerSync('clock/prefs-init', getPrefs)
    load()
    detectSystemTimeFormat()
  },
}

const { execFile } = require('child_process')
const { runPowerShell, runElevatedPowerShell } = require('../powershell')
const {
  READ_STATE_SCRIPT,
  EMPTY_STATE,
  parseDateTimeState,
  isOfferedTimeZone,
  autoTimeZoneScript,
  autoTimeScript,
  syncNowScript,
} = require('./dateTimeCommands')

const HWND_BROADCAST = 0xffff
const WM_TIMECHANGE = 0x001e
const SMTO_ABORTIFHUNG = 0x0002
const TIME_CHANGE_TIMEOUT_MS = 200
const CHANGED_CHANNEL = 'date-time/changed'

let lastState = EMPTY_STATE
let broadcast = null

function announceTimeChange() {
  try {
    const koffi = require('koffi')
    const SendMessageTimeoutW = koffi
      .load('user32.dll')
      .func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t', 'uint32', 'uint32', 'void *'])
    SendMessageTimeoutW(HWND_BROADCAST, WM_TIMECHANGE, 0, 0, SMTO_ABORTIFHUNG, TIME_CHANGE_TIMEOUT_MS, null)
  } catch (e) {
    console.error('[dateTime] time change broadcast failed:', e.message)
  }
}

async function readState() {
  lastState = parseDateTimeState(await runPowerShell(READ_STATE_SCRIPT))
  return lastState
}

async function publishFreshState() {
  const state = await readState()
  if (broadcast) broadcast(CHANGED_CHANNEL, state)
  return state
}

function runTimeZoneUtility(id) {
  return new Promise((resolve) => {
    execFile('tzutil.exe', ['/s', id], { windowsHide: true }, (err) => {
      if (err) console.error('[dateTime] tzutil failed:', err.message)
      resolve(!err)
    })
  })
}

async function setTimeZone(id) {
  const known = isOfferedTimeZone(lastState, id) ? lastState : await readState()
  if (!isOfferedTimeZone(known, id)) return { ok: false, declined: false, state: known }
  const ok = await runTimeZoneUtility(id)
  if (ok) announceTimeChange()
  return { ok, declined: false, state: await publishFreshState() }
}

async function runElevatedChange(script) {
  const outcome = await runElevatedPowerShell(script)
  if (outcome.ok) announceTimeChange()
  return { ...outcome, state: await publishFreshState() }
}

module.exports = {
  handlers: {
    'date-time/state': () => readState(),
    'date-time/set-time-zone': (_event, id) => setTimeZone(id),
    'date-time/set-auto-time-zone': (_event, on) => runElevatedChange(autoTimeZoneScript(on === true)),
    'date-time/set-auto-time': (_event, on) => runElevatedChange(autoTimeScript(on === true)),
    'date-time/sync-now': () => runElevatedChange(syncNowScript()),
  },
  start(broadcastToWindows) {
    broadcast = broadcastToWindows
  },
}

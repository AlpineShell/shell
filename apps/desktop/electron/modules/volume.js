const { spawn } = require('child_process')
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { volumeKeyAction } = require('./appCommandPolicy')
const { NO_AUDIO_DEVICES, isEndpointId, parseAudioDevices, findAudioDevice, withDefaultDevice } = require('./audioDevices')

const SCRIPT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'audio.ps1')
  : path.join(__dirname, '..', 'scripts', 'audio.ps1')
const DELIM = '__AUDIO_DONE__'

let ps = null
let psReady = null
let pendingResolve = null
let outputBuf = ''
let commandQueue = []
let busy = false
let lastSetTime = 0
let lastVolume = undefined
let lastMute = undefined

function initPS() {
  if (psReady) return psReady
  psReady = new Promise((resolveInit) => {
    ps = spawn('powershell', [
      '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', '-'
    ], { stdio: ['pipe', 'pipe', 'ignore'] })

    ps.stdout.on('data', (chunk) => {
      outputBuf += chunk.toString()
      const idx = outputBuf.indexOf(DELIM)
      if (idx !== -1) {
        const result = outputBuf.substring(0, idx).trim()
        outputBuf = outputBuf.substring(idx + DELIM.length).replace(/^\r?\n/, '')
        if (pendingResolve) {
          const r = pendingResolve
          pendingResolve = null
          r(result)
        }
      }
    })

    ps.on('exit', () => {
      console.error('[volume] PowerShell process exited unexpectedly')
      ps = null
      psReady = null
      busy = false
      if (pendingResolve) { pendingResolve(''); pendingResolve = null }
      for (const { resolve } of commandQueue) resolve('')
      commandQueue = []
    })

    const script = fs.readFileSync(SCRIPT_PATH, 'utf8')
    const switchIdx = script.indexOf('\nswitch')
    const typeDef = switchIdx > 0 ? script.substring(0, switchIdx) : script
    pendingResolve = () => { resolveInit(); processNext() }
    ps.stdin.write(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n${typeDef}\nWrite-Output '${DELIM}'\n`)
  })
  return psReady
}

function processNext() {
  if (commandQueue.length === 0) { busy = false; return }
  busy = true
  const { cmd, resolve } = commandQueue.shift()
  pendingResolve = (result) => {
    resolve(result)
    processNext()
  }
  ps.stdin.write(`${cmd}\nWrite-Output '${DELIM}'\n`)
}

async function runCmd(cmd) {
  await initPS()
  return new Promise((resolve) => {
    commandQueue.push({ cmd, resolve })
    if (!busy) processNext()
  })
}

async function getVolume() {
  try {
    const result = await runCmd('[math]::Round([Audio]::GetVolume() * 100)')
    const val = parseInt(result, 10)
    return isNaN(val) ? 50 : val
  } catch {
    return 50
  }
}

async function setVolume(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  lastSetTime = Date.now()
  commandQueue = commandQueue.filter(c => !c.cmd.startsWith('[Audio]::SetVolume'))
  await runCmd(`[Audio]::SetVolume(${clamped} / 100.0)`)
  return clamped
}

async function getMute() {
  try {
    const result = await runCmd('[Audio]::GetMute()')
    return result.trim() === 'True'
  } catch {
    return false
  }
}

function parseState(raw) {
  const [rawVolume, rawMute] = raw.trim().split('|')
  const volume = parseInt(rawVolume, 10)
  if (isNaN(volume)) return null
  return { volume, muted: rawMute === '1' }
}

async function getState() {
  try {
    return parseState(await runCmd('[Audio]::GetState()'))
  } catch {
    return null
  }
}

function publishState(state) {
  if (!state || !broadcastToTopbarsRef) return
  if (state.volume !== lastVolume) {
    lastVolume = state.volume
    broadcastToTopbarsRef('system/volume-changed', state.volume)
  }
  if (state.muted !== lastMute) {
    lastMute = state.muted
    broadcastToTopbarsRef('system/mute-changed', state.muted)
  }
}

function volumeKeyCommand(action) {
  if (action.kind === 'toggle-mute') return '[Audio]::ToggleMute()'
  return `[Audio]::StepVolume(${action.delta})`
}

async function applyAppCommand(appCommand) {
  const action = volumeKeyAction(appCommand)
  if (!action) return
  try {
    publishState(parseState(await runCmd(volumeKeyCommand(action))))
  } catch (e) {
    console.error('[volume] volume key error:', e.message)
  }
}

async function setMute(muted) {
  lastSetTime = Date.now()
  commandQueue = commandQueue.filter(c => !c.cmd.startsWith('[Audio]::SetMute'))
  await runCmd(`[Audio]::SetMute($${muted ? 'true' : 'false'})`)
  return muted
}

let broadcastRef = null
let lastAudioDevicesKey = null

async function getAudioDevices() {
  try {
    return parseAudioDevices(await runCmd('ConvertTo-Json -Compress -InputObject @([AudioDevices]::List())'))
  } catch {
    return NO_AUDIO_DEVICES
  }
}

function publishAudioDevices(devices) {
  const key = JSON.stringify(devices)
  if (key === lastAudioDevicesKey || !broadcastRef) return
  lastAudioDevicesKey = key
  broadcastRef('system/audio-devices-changed', devices)
}

async function refreshAudioDevices() {
  const devices = await getAudioDevices()
  publishAudioDevices(devices)
  return devices
}

async function setDefaultAudioDevice(id) {
  if (!isEndpointId(id)) return { ok: false, devices: await refreshAudioDevices() }
  const devices = await getAudioDevices()
  if (!findAudioDevice(devices, id)) return { ok: false, devices }
  try {
    const result = await runCmd(`[AudioDevices]::SetDefault('${id}')`)
    if (result.trim() !== 'True') return { ok: false, devices: await refreshAudioDevices() }
  } catch (e) {
    console.error('[volume] default device error:', e.message)
    return { ok: false, devices: await refreshAudioDevices() }
  }
  const refreshed = await getAudioDevices()
  const settled = findAudioDevice(refreshed, id)?.isDefault ? refreshed : withDefaultDevice(refreshed, id)
  publishAudioDevices(settled)
  publishState(await getState())
  return { ok: true, devices: settled }
}

let peakInterval = null
let lastPeak = null
let broadcastToTopbarsRef = null
const peakSubscribers = new Map()

async function getPeak() {
  try {
    const result = await runCmd('[Math]::Round([Audio]::GetPeak(), 3)')
    return parseFloat(result) || 0
  } catch {
    return 0
  }
}

function startPeakMeter() {
  if (peakInterval || !broadcastToTopbarsRef) return
  peakInterval = setInterval(async () => {
    const peak = await getPeak()
    if (!peakInterval || peak === lastPeak) return
    lastPeak = peak
    broadcastToTopbarsRef('system/audio-peak', peak)
  }, 66)
}

function stopPeakMeter() {
  if (peakInterval) {
    clearInterval(peakInterval)
    peakInterval = null
  }
  lastPeak = null
}

function forgetPeakSubscriber(sender) {
  const detachFromSender = peakSubscribers.get(sender.id)
  if (!detachFromSender) return
  peakSubscribers.delete(sender.id)
  detachFromSender()
  if (peakSubscribers.size === 0) stopPeakMeter()
}

function rememberPeakSubscriber(sender) {
  if (peakSubscribers.has(sender.id)) return
  const forget = () => forgetPeakSubscriber(sender)
  sender.on('destroyed', forget)
  sender.on('render-process-gone', forget)
  peakSubscribers.set(sender.id, () => {
    if (sender.isDestroyed()) return
    sender.removeListener('destroyed', forget)
    sender.removeListener('render-process-gone', forget)
  })
}

module.exports = {
  handlers: {
    'system/volume-get': () => getVolume(),
    'system/volume-set': (_event, value) => setVolume(value),
    'system/mute-get': () => getMute(),
    'system/mute-set': (_event, muted) => setMute(muted),
    'system/audio-devices-get': () => getAudioDevices(),
    'system/audio-device-set': (_event, id) => setDefaultAudioDevice(id),
    'system/peak-subscribe': (event) => {
      if (!event?.sender) return false
      rememberPeakSubscriber(event.sender)
      lastPeak = null
      startPeakMeter()
      return true
    },
    'system/peak-unsubscribe': (event) => {
      if (event?.sender) forgetPeakSubscriber(event.sender)
      return true
    },
  },

  applyAppCommand,

  start(broadcast, broadcastToTopbars) {
    broadcastRef = broadcast
    broadcastToTopbarsRef = broadcastToTopbars
    if (peakSubscribers.size > 0) startPeakMeter()
    initPS()

    setInterval(async () => {
      if (Date.now() - lastSetTime < 1500) return
      publishState(await getState())
    }, 1000)

    setInterval(refreshAudioDevices, 3000)
  },
}

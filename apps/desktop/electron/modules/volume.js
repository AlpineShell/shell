const { volumeKeyAction } = require('./appCommandPolicy')
const { NO_AUDIO_DEVICES, isEndpointId, findAudioDevice, withDefaultDevice } = require('./audioDevices')
const { loadAudioEndpoint } = require('./audioEndpoint')
const { skippedWhileStillRunning } = require('../skippedWhileStillRunning')
const { createVolumeChangeFeed } = require('./volumeChangeFeed')

const SET_SETTLE_MS = 1500
const DEVICE_CHANGE_DELAY_MS = 100
const POLLED_STATE_INTERVAL_MS = 1000
const POLLED_DEVICES_INTERVAL_MS = 3000
const WATCHED_SAFETY_POLL_INTERVAL_MS = 15000

let endpoint = null
let lastSetTime = 0
let lastVolume = undefined
let lastMute = undefined

function logAudioFailure(error) {
  console.error('[volume] audio call failed:', error?.message ?? error)
}

function audioEndpoint() {
  if (!endpoint) endpoint = loadAudioEndpoint()
  return endpoint
}

async function getVolume() {
  try {
    return (await audioEndpoint().getState()).volume
  } catch {
    return 50
  }
}

async function setVolume(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  lastSetTime = Date.now()
  await audioEndpoint().setVolume(clamped).catch(logAudioFailure)
  return clamped
}

async function getMute() {
  try {
    return (await audioEndpoint().getState()).muted
  } catch {
    return false
  }
}

async function getState() {
  try {
    return await audioEndpoint().getState()
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

function applyVolumeKeyAction(action) {
  if (action.kind === 'toggle-mute') return audioEndpoint().toggleMute()
  return audioEndpoint().stepVolume(action.delta)
}

async function applyAppCommand(appCommand) {
  const action = volumeKeyAction(appCommand)
  if (!action) return
  try {
    publishState(await applyVolumeKeyAction(action))
  } catch (e) {
    console.error('[volume] volume key error:', e.message)
  }
}

async function setMute(muted) {
  lastSetTime = Date.now()
  await audioEndpoint().setMute(muted).catch(logAudioFailure)
  return muted
}

let broadcastRef = null
let lastAudioDevicesKey = null

async function getAudioDevices() {
  try {
    return await audioEndpoint().listDevices()
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
    if (!(await audioEndpoint().setDefaultDevice(id))) return { ok: false, devices: await refreshAudioDevices() }
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
    return await audioEndpoint().getPeak()
  } catch {
    return 0
  }
}

function startPeakMeter() {
  if (peakInterval || !broadcastToTopbarsRef) return
  peakInterval = setInterval(skippedWhileStillRunning('volume', async () => {
    const peak = await getPeak()
    if (!peakInterval || peak === lastPeak) return
    lastPeak = peak
    broadcastToTopbarsRef('system/audio-peak', peak)
  }), 66)
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

function millisSinceLastSet() {
  return Date.now() - lastSetTime
}

const changeFeed = createVolumeChangeFeed({
  settleMs: SET_SETTLE_MS,
  deviceChangeDelayMs: DEVICE_CHANGE_DELAY_MS,
  millisSinceLastSet,
  readState: getState,
  publishState,
  refreshDevices: refreshAudioDevices,
})

async function watchEndpointChanges() {
  const chosen = audioEndpoint()
  if (typeof chosen.watch !== 'function') return false
  try {
    await chosen.watch(changeFeed.onVolumeChanged, changeFeed.onDevicesChanged)
    return true
  } catch (e) {
    logAudioFailure(e)
    return false
  }
}

function startPolling(watching) {
  setInterval(skippedWhileStillRunning('volume', async () => {
    if (millisSinceLastSet() < SET_SETTLE_MS) return
    publishState(await getState())
  }), watching ? WATCHED_SAFETY_POLL_INTERVAL_MS : POLLED_STATE_INTERVAL_MS)

  setInterval(skippedWhileStillRunning('volume', refreshAudioDevices), watching ? WATCHED_SAFETY_POLL_INTERVAL_MS : POLLED_DEVICES_INTERVAL_MS)
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
    audioEndpoint().start()
    watchEndpointChanges().then(startPolling)
  },
}

const path = require('path')
const fs = require('fs')
const battery = require('./battery')
const brightness = require('./brightness')
const policy = require('./batterySaverPolicy')

let powerThrottling = null
try { powerThrottling = require('./powerThrottling') } catch (e) { console.error('[batterySaver] powerThrottling load error:', e?.message ?? e) }

const STORE_FILE = 'battery-saver-prefs.json'
const OVERRIDE_RESET_SETTLE_MS = 30000

let storePath = null
let broadcastRef = null
let config = { ...policy.DEFAULT_CONFIG }
let batteryStatus = { percent: null, charging: false, onAcPower: false, hasBattery: false }
let override = policy.DEFAULT_OVERRIDE
let overrideResetTimer = null
let active = false
let reason = null
let activeThresholdPercent = null

const adaptivePollers = new Set()

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
    config = policy.mergeConfig(policy.DEFAULT_CONFIG, JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (e) {
    console.error('[batterySaver] load error:', e.message)
  }
}

function save() {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify(config, null, 2))
  } catch (e) {
    console.error('[batterySaver] save error:', e.message)
  }
}

function getConfig() {
  return { ...config }
}

function getState() {
  return {
    active,
    reason,
    override,
    percent: batteryStatus.percent,
    charging: batteryStatus.charging,
    onAcPower: batteryStatus.onAcPower,
    hasBattery: batteryStatus.hasBattery,
  }
}

function isBackgroundPollingReduced() {
  return active && config.reduceBackgroundPolling
}

function pollerDelay(poller) {
  return isBackgroundPollingReduced() ? poller.savingIntervalMs : poller.normalIntervalMs
}

function schedulePoller(poller) {
  clearTimeout(poller.timer)
  poller.scheduledDelay = pollerDelay(poller)
  poller.timer = setTimeout(() => runPoller(poller), poller.scheduledDelay)
}

function runPoller(poller) {
  schedulePoller(poller)
  try {
    const result = poller.poll()
    if (result && typeof result.catch === 'function') result.catch((e) => console.error('[batterySaver] adaptive poll rejected:', e?.message ?? e))
  } catch (e) {
    console.error('[batterySaver] adaptive poll failed:', e?.message ?? e)
  }
}

function stopPoller(poller) {
  clearTimeout(poller.timer)
  poller.timer = null
  adaptivePollers.delete(poller)
}

function startAdaptivePolling(poll, normalIntervalMs, savingIntervalMs) {
  const poller = { poll, normalIntervalMs, savingIntervalMs, timer: null, scheduledDelay: null }
  adaptivePollers.add(poller)
  schedulePoller(poller)
  return () => stopPoller(poller)
}

function rescheduleAdaptivePollers() {
  for (const poller of adaptivePollers) {
    if (pollerDelay(poller) !== poller.scheduledDelay) schedulePoller(poller)
  }
}

function applyDisplayDimming() {
  const dim = active && config.dimDisplays
    ? brightness.applyBatterySaverDimming(config.brightnessReductionPercent, config.dimExternalDisplays)
    : brightness.clearBatterySaverDimming()
  if (dim && typeof dim.catch === 'function') dim.catch((e) => console.error('[batterySaver] display dimming failed:', e?.message ?? e))
}

function applyProcessThrottling() {
  if (!powerThrottling) return
  powerThrottling.setEcoQosPreference(active && config.throttleProcesses)
}

function applyEffects() {
  applyDisplayDimming()
  applyProcessThrottling()
  rescheduleAdaptivePollers()
}

function publishState() {
  if (broadcastRef) broadcastRef('battery-saver/state-changed', getState())
}

function publishConfig() {
  if (broadcastRef) broadcastRef('battery-saver/config-changed', getConfig())
}

function refreshActivation() {
  const resolution = policy.resolveBatterySaverActivation({
    config,
    battery: batteryStatus,
    override,
    previouslyActive: active,
    activeThresholdPercent,
  })
  const changed = resolution.active !== active || resolution.reason !== reason
  active = resolution.active
  reason = resolution.reason
  activeThresholdPercent = active ? config.thresholdPercent : null
  return changed
}

function settleActivation() {
  if (refreshActivation()) applyEffects()
  publishState()
}

function cancelOverrideReset() {
  clearTimeout(overrideResetTimer)
  overrideResetTimer = null
}

function armOverrideReset() {
  if (overrideResetTimer) return
  overrideResetTimer = setTimeout(() => {
    overrideResetTimer = null
    if (override === policy.DEFAULT_OVERRIDE || !policy.isPluggedIn(batteryStatus)) return
    override = policy.DEFAULT_OVERRIDE
    settleActivation()
  }, OVERRIDE_RESET_SETTLE_MS)
}

function trackOverrideResetTransition(previousStatus, nextStatus) {
  if (override === policy.DEFAULT_OVERRIDE || !policy.isPluggedIn(nextStatus)) return cancelOverrideReset()
  if (policy.shouldResetOverride(previousStatus, nextStatus)) armOverrideReset()
}

function handleBatteryStatus(status) {
  const previousStatus = batteryStatus
  batteryStatus = status
  trackOverrideResetTransition(previousStatus, status)
  settleActivation()
}

module.exports = {
  startAdaptivePolling,

  handlers: {
    'battery-saver/config-get': () => getConfig(),
    'battery-saver/config-set': (_event, partial) => {
      config = policy.mergeConfig(config, partial)
      save()
      refreshActivation()
      applyEffects()
      publishConfig()
      publishState()
      return getConfig()
    },
    'battery-saver/state-get': () => getState(),
    'battery-saver/override-set': (_event, value) => {
      override = policy.normalizeOverride(value)
      cancelOverrideReset()
      settleActivation()
      return getState()
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    load()
    batteryStatus = battery.getBatteryStatus()
    battery.onBatteryStatusChanged(handleBatteryStatus)
    refreshActivation()
    applyEffects()
  },
}

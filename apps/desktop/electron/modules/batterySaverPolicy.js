const { isPersistableMonitorKey } = require('./monitorIdentity')

const THRESHOLD_MIN_PERCENT = 5
const THRESHOLD_MAX_PERCENT = 90
const THRESHOLD_DEFAULT_PERCENT = 20
const THRESHOLD_EXIT_MARGIN_PERCENT = 5

const BRIGHTNESS_REDUCTION_MIN_PERCENT = 5
const BRIGHTNESS_REDUCTION_MAX_PERCENT = 60
const BRIGHTNESS_REDUCTION_DEFAULT_PERCENT = 30
const MIN_SAVER_BRIGHTNESS_PERCENT = 10

const OVERRIDES = ['auto', 'on', 'off']
const DEFAULT_OVERRIDE = 'auto'

const DEFAULT_CONFIG = {
  automaticEnabled: true,
  thresholdPercent: THRESHOLD_DEFAULT_PERCENT,
  dimDisplays: true,
  dimExternalDisplays: false,
  brightnessReductionPercent: BRIGHTNESS_REDUCTION_DEFAULT_PERCENT,
  reduceBackgroundPolling: true,
  throttleProcesses: false,
}

function clampPercent(value, min, max, fallback) {
  const rounded = Math.round(Number(value))
  if (!Number.isFinite(rounded)) return fallback
  return Math.max(min, Math.min(max, rounded))
}

function clampBrightnessPercent(value) {
  return clampPercent(value, 0, 100, 0)
}

function clampThresholdPercent(value) {
  return clampPercent(value, THRESHOLD_MIN_PERCENT, THRESHOLD_MAX_PERCENT, THRESHOLD_DEFAULT_PERCENT)
}

function clampBrightnessReductionPercent(value) {
  return clampPercent(value, BRIGHTNESS_REDUCTION_MIN_PERCENT, BRIGHTNESS_REDUCTION_MAX_PERCENT, BRIGHTNESS_REDUCTION_DEFAULT_PERCENT)
}

function mergeConfig(current, partial) {
  const merged = { ...DEFAULT_CONFIG, ...current }
  if (!partial || typeof partial !== 'object') return merged
  if (typeof partial.automaticEnabled === 'boolean') merged.automaticEnabled = partial.automaticEnabled
  if (partial.thresholdPercent !== undefined) merged.thresholdPercent = clampThresholdPercent(partial.thresholdPercent)
  if (typeof partial.dimDisplays === 'boolean') merged.dimDisplays = partial.dimDisplays
  if (typeof partial.dimExternalDisplays === 'boolean') merged.dimExternalDisplays = partial.dimExternalDisplays
  if (partial.brightnessReductionPercent !== undefined) merged.brightnessReductionPercent = clampBrightnessReductionPercent(partial.brightnessReductionPercent)
  if (typeof partial.reduceBackgroundPolling === 'boolean') merged.reduceBackgroundPolling = partial.reduceBackgroundPolling
  if (typeof partial.throttleProcesses === 'boolean') merged.throttleProcesses = partial.throttleProcesses
  return merged
}

function dimmedBrightness(baselinePercent, reductionPercent) {
  const reduced = Math.round((baselinePercent * (100 - reductionPercent)) / 100)
  if (reduced < MIN_SAVER_BRIGHTNESS_PERCENT) return Math.min(baselinePercent, MIN_SAVER_BRIGHTNESS_PERCENT)
  return reduced
}

function isBatteryPoweredDisplay(monitor) {
  return !!monitor && monitor.type === 'internal'
}

function isDimmableDisplay(monitor, dimExternalDisplays) {
  if (!monitor || !isPersistableMonitorKey(monitor.stableKey)) return false
  return isBatteryPoweredDisplay(monitor) || !!dimExternalDisplays
}

function displaysToDim(monitors, dimExternalDisplays) {
  return (monitors ?? []).filter(monitor => isDimmableDisplay(monitor, dimExternalDisplays))
}

function isPluggedIn(battery) {
  return !!battery && (battery.onAcPower || battery.charging)
}

function activationLimit(thresholdPercent, previouslyActive, activeThresholdPercent) {
  const holdingAgainstChargeDrift = previouslyActive && activeThresholdPercent === thresholdPercent
  return holdingAgainstChargeDrift ? thresholdPercent + THRESHOLD_EXIT_MARGIN_PERCENT : thresholdPercent
}

function normalizeOverride(value) {
  return OVERRIDES.includes(value) ? value : DEFAULT_OVERRIDE
}

function resolveBatterySaverActivation({ config, battery, override, previouslyActive, activeThresholdPercent }) {
  if (override === 'on') return { active: true, reason: 'manual' }
  if (override === 'off') return { active: false, reason: null }
  if (!config || !config.automaticEnabled) return { active: false, reason: null }
  if (!battery || !battery.hasBattery) return { active: false, reason: null }
  if (isPluggedIn(battery)) return { active: false, reason: null }
  if (typeof battery.percent !== 'number') return { active: false, reason: null }
  const limit = activationLimit(config.thresholdPercent, previouslyActive, activeThresholdPercent)
  if (battery.percent > limit) return { active: false, reason: null }
  return { active: true, reason: 'threshold' }
}

function shouldResetOverride(previousBattery, nextBattery) {
  if (!isPluggedIn(nextBattery)) return false
  return !isPluggedIn(previousBattery)
}

module.exports = {
  THRESHOLD_MIN_PERCENT,
  THRESHOLD_MAX_PERCENT,
  THRESHOLD_DEFAULT_PERCENT,
  THRESHOLD_EXIT_MARGIN_PERCENT,
  BRIGHTNESS_REDUCTION_MIN_PERCENT,
  BRIGHTNESS_REDUCTION_MAX_PERCENT,
  BRIGHTNESS_REDUCTION_DEFAULT_PERCENT,
  MIN_SAVER_BRIGHTNESS_PERCENT,
  DEFAULT_CONFIG,
  DEFAULT_OVERRIDE,
  isPluggedIn,
  normalizeOverride,
  clampThresholdPercent,
  clampBrightnessPercent,
  clampBrightnessReductionPercent,
  mergeConfig,
  dimmedBrightness,
  isBatteryPoweredDisplay,
  isDimmableDisplay,
  displaysToDim,
  resolveBatterySaverActivation,
  shouldResetOverride,
}

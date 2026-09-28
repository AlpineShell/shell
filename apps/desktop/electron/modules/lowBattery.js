const battery = require('./battery')
const notice = require('./shellNotice')
const policy = require('./lowBatteryPolicy')
const { encodeGuid } = require('../bluetoothNative')

const ERROR_SUCCESS = 0
const GUID_BATTERY_SUBGROUP = encodeGuid('{e73a048d-bf27-4f12-9731-8b2076e8891f}')
const GUID_LOW_BATTERY_LEVEL = encodeGuid('{8183ba9a-e910-48da-8769-14ae6dc1170a}')
const GUID_LOW_BATTERY_NOTIFICATION = encodeGuid('{bcded951-187b-4d05-bccc-f7e51960c258}')

let powerSchemeApi = null
let powerSchemeApiUnavailable = false
let warned = false

function loadPowerSchemeApi() {
  if (powerSchemeApi || powerSchemeApiUnavailable) return powerSchemeApi
  try {
    const koffi = require('koffi')
    const powrprof = koffi.load('powrprof.dll')
    const kernel32 = koffi.load('kernel32.dll')
    powerSchemeApi = {
      PowerGetActiveScheme: powrprof.func('__stdcall', 'PowerGetActiveScheme', 'uint32', ['uintptr_t', koffi.out(koffi.pointer('void *'))]),
      PowerReadDCValueIndex: powrprof.func('__stdcall', 'PowerReadDCValueIndex', 'uint32', ['uintptr_t', 'void *', 'void *', 'void *', koffi.out(koffi.pointer('uint32'))]),
      LocalFree: kernel32.func('__stdcall', 'LocalFree', 'uintptr_t', ['void *']),
    }
  } catch (e) {
    powerSchemeApiUnavailable = true
    console.error('[lowBattery] power scheme API unavailable:', e?.message ?? e)
  }
  return powerSchemeApi
}

function readBatterySetting(api, scheme, setting) {
  const value = [0]
  return api.PowerReadDCValueIndex(0, scheme, GUID_BATTERY_SUBGROUP, setting, value) === ERROR_SUCCESS ? value[0] : null
}

function readLowBatteryAlert() {
  const api = loadPowerSchemeApi()
  const scheme = [null]
  if (!api || api.PowerGetActiveScheme(0, scheme) !== ERROR_SUCCESS || !scheme[0]) return policy.lowBatteryAlert(null, null)
  try {
    return policy.lowBatteryAlert(
      readBatterySetting(api, scheme[0], GUID_LOW_BATTERY_NOTIFICATION),
      readBatterySetting(api, scheme[0], GUID_LOW_BATTERY_LEVEL),
    )
  } finally {
    api.LocalFree(scheme[0])
  }
}

function currentLowBatteryAlert() {
  try {
    return readLowBatteryAlert()
  } catch (e) {
    console.error('[lowBattery] reading the power scheme failed:', e?.message ?? e)
    return policy.lowBatteryAlert(null, null)
  }
}

function onBatteryStatus(status) {
  const step = policy.lowBatteryStep(status, currentLowBatteryAlert(), warned)
  warned = step.warned
  if (step.action === 'show') notice.show(policy.lowBatteryNotice(status.percent))
  else if (step.action === 'dismiss') notice.dismiss(policy.LOW_BATTERY_NOTICE_ID)
}

module.exports = {
  handlers: {},

  start() {
    battery.onBatteryStatusChanged(onBatteryStatus)
  },
}

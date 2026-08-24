const koffi = require('koffi')

let GetSystemPowerStatus = null
try {
  const kernel32 = koffi.load('kernel32.dll')
  const SYSTEM_POWER_STATUS = koffi.struct('SYSTEM_POWER_STATUS', {
    ACLineStatus: 'uint8',
    BatteryFlag: 'uint8',
    BatteryLifePercent: 'uint8',
    SystemStatusFlag: 'uint8',
    BatteryLifeTime: 'uint32',
    BatteryFullLifeTime: 'uint32',
  })
  GetSystemPowerStatus = kernel32.func('__stdcall', 'GetSystemPowerStatus', 'int', [koffi.out(koffi.pointer(SYSTEM_POWER_STATUS))])
} catch (e) {
  console.error('[battery] GetSystemPowerStatus load failed:', e?.message ?? e)
}

const CHARGING_FLAG = 0x08
const NO_SYSTEM_BATTERY_FLAG = 0x80
const AC_LINE_ONLINE = 1
const MAX_VALID_PERCENT = 100
const POLL_INTERVAL_MS = 10000

let lastStatusKey = null

const listeners = new Set()

const UNAVAILABLE = { percent: null, charging: false, onAcPower: false, hasBattery: false }

function readBatteryStatus() {
  if (!GetSystemPowerStatus) return UNAVAILABLE
  const status = {}
  if (!GetSystemPowerStatus(status)) return UNAVAILABLE
  const percent = status.BatteryLifePercent <= MAX_VALID_PERCENT ? status.BatteryLifePercent : null
  const charging = (status.BatteryFlag & CHARGING_FLAG) !== 0
  const onAcPower = status.ACLineStatus === AC_LINE_ONLINE
  const hasBattery = status.BatteryFlag !== NO_SYSTEM_BATTERY_FLAG
  return { percent, charging, onAcPower, hasBattery }
}

function statusKey(status) {
  return `${status.percent}:${status.charging}:${status.onAcPower}:${status.hasBattery}`
}

function notifyListeners(status) {
  for (const listener of listeners) {
    try {
      listener(status)
    } catch (e) {
      console.error('[battery] listener failed:', e?.message ?? e)
    }
  }
}

function publishIfChanged(broadcast) {
  const current = readBatteryStatus()
  const key = statusKey(current)
  if (key === lastStatusKey) return
  lastStatusKey = key
  broadcast('system/battery-changed', current)
  notifyListeners(current)
}

module.exports = {
  getBatteryStatus: () => readBatteryStatus(),

  onBatteryStatusChanged(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  handlers: {
    'system/battery': () => readBatteryStatus(),
  },

  start(broadcast) {
    const { powerMonitor } = require('electron')
    setInterval(() => publishIfChanged(broadcast), POLL_INTERVAL_MS)
    powerMonitor.on('on-ac', () => publishIfChanged(broadcast))
    powerMonitor.on('on-battery', () => publishIfChanged(broadcast))
  },
}

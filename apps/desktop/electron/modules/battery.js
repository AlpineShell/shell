const koffi = require('koffi')
const notifications = require('./notifications')

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
const MAX_VALID_PERCENT = 100
const LOW_BATTERY_THRESHOLD = 20

let lastPercent = undefined
let lastCharging = undefined
let lowNotified = false

const UNAVAILABLE = { percent: null, charging: false, hasBattery: false }

function readBatteryStatus() {
  if (!GetSystemPowerStatus) return UNAVAILABLE
  const status = {}
  if (!GetSystemPowerStatus(status)) return UNAVAILABLE
  const percent = status.BatteryLifePercent <= MAX_VALID_PERCENT ? status.BatteryLifePercent : null
  const charging = (status.BatteryFlag & CHARGING_FLAG) !== 0
  const hasBattery = status.BatteryFlag !== NO_SYSTEM_BATTERY_FLAG
  return { percent, charging, hasBattery }
}

module.exports = {
  handlers: {
    'system/battery': () => readBatteryStatus(),
  },

  start(broadcast) {
    setInterval(() => {
      const current = readBatteryStatus()
      if (current.percent !== lastPercent || current.charging !== lastCharging) {
        lastPercent = current.percent
        lastCharging = current.charging
        broadcast('system/battery-changed', current)
      }
      if (current.hasBattery && current.percent !== null) {
        if (!current.charging && current.percent <= LOW_BATTERY_THRESHOLD && !lowNotified) {
          lowNotified = true
          notifications.post({ source: 'alpine', appName: 'Battery', title: 'Low battery', body: `${current.percent}% remaining — plug in your charger.` })
        } else if (current.charging || current.percent > LOW_BATTERY_THRESHOLD) {
          lowNotified = false
        }
      }
    }, 10000)
  },
}

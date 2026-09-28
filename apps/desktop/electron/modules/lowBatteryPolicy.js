const LOW_BATTERY_NOTICE_ID = 'battery-low'
const DEFAULT_LOW_BATTERY_PERCENT = 10
const MAX_PERCENT = 100

function isPercent(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_PERCENT
}

function lowBatteryAlert(notificationSetting, levelSetting) {
  return {
    enabled: notificationSetting !== 0,
    levelPercent: isPercent(levelSetting) ? levelSetting : DEFAULT_LOW_BATTERY_PERCENT,
  }
}

function isDischarging(status) {
  return Boolean(status && status.hasBattery && isPercent(status.percent) && !status.onAcPower && !status.charging)
}

function lowBatteryStep(status, alert, warned) {
  if (!isDischarging(status)) return { action: warned ? 'dismiss' : null, warned: false }
  if (warned || !alert.enabled || status.percent > alert.levelPercent) return { action: null, warned }
  return { action: 'show', warned: true }
}

function lowBatteryNotice(percent) {
  return {
    id: LOW_BATTERY_NOTICE_ID,
    title: 'Battery low',
    message: `${percent}% remaining`,
    tone: 'error',
    timeoutMs: 0,
    waitForTurn: true,
  }
}

module.exports = {
  LOW_BATTERY_NOTICE_ID,
  DEFAULT_LOW_BATTERY_PERCENT,
  lowBatteryAlert,
  lowBatteryStep,
  lowBatteryNotice,
}

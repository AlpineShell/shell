import { describe, it, expect } from 'vitest'
import lowBatteryPolicy from './lowBatteryPolicy.js'

const {
  LOW_BATTERY_NOTICE_ID,
  DEFAULT_LOW_BATTERY_PERCENT,
  lowBatteryAlert,
  lowBatteryStep,
  lowBatteryNotice,
} = lowBatteryPolicy

const ALERT_AT_10 = { enabled: true, levelPercent: 10 }

function onBattery(percent) {
  return { percent, charging: false, onAcPower: false, hasBattery: true }
}

function pluggedIn(percent) {
  return { percent, charging: true, onAcPower: true, hasBattery: true }
}

describe('lowBatteryAlert', () => {
  it('follows the power plan level and notification switch', () => {
    expect(lowBatteryAlert(1, 12)).toEqual({ enabled: true, levelPercent: 12 })
    expect(lowBatteryAlert(0, 12)).toEqual({ enabled: false, levelPercent: 12 })
  })

  it('falls back to the Windows default when the plan cannot be read', () => {
    expect(DEFAULT_LOW_BATTERY_PERCENT).toBe(10)
    expect(lowBatteryAlert(null, null)).toEqual({ enabled: true, levelPercent: 10 })
  })

  it('ignores a level that is not a percentage', () => {
    expect(lowBatteryAlert(1, 255)).toEqual({ enabled: true, levelPercent: 10 })
    expect(lowBatteryAlert(1, -1)).toEqual({ enabled: true, levelPercent: 10 })
    expect(lowBatteryAlert(1, 0)).toEqual({ enabled: true, levelPercent: 0 })
  })
})

describe('lowBatteryStep', () => {
  it('warns when the battery drops to the low level while on battery', () => {
    expect(lowBatteryStep(onBattery(11), ALERT_AT_10, false)).toEqual({ action: null, warned: false })
    expect(lowBatteryStep(onBattery(10), ALERT_AT_10, false)).toEqual({ action: 'show', warned: true })
  })

  it('warns at start when the battery is already below the level', () => {
    expect(lowBatteryStep(onBattery(4), ALERT_AT_10, false)).toEqual({ action: 'show', warned: true })
  })

  it('warns once per discharge, not at every lower percent', () => {
    expect(lowBatteryStep(onBattery(9), ALERT_AT_10, true)).toEqual({ action: null, warned: true })
    expect(lowBatteryStep(onBattery(11), ALERT_AT_10, true)).toEqual({ action: null, warned: true })
  })

  it('takes the warning down and re-arms once the PC is plugged in', () => {
    expect(lowBatteryStep(pluggedIn(9), ALERT_AT_10, true)).toEqual({ action: 'dismiss', warned: false })
    expect(lowBatteryStep(onBattery(9), ALERT_AT_10, false)).toEqual({ action: 'show', warned: true })
  })

  it('treats a charging battery as plugged in', () => {
    expect(lowBatteryStep({ ...onBattery(5), charging: true }, ALERT_AT_10, false)).toEqual({ action: null, warned: false })
  })

  it('stays quiet when the power plan turned the low battery notification off', () => {
    expect(lowBatteryStep(onBattery(5), { enabled: false, levelPercent: 10 }, false)).toEqual({ action: null, warned: false })
  })

  it('stays quiet on a desktop or when the percentage is unknown', () => {
    expect(lowBatteryStep({ percent: null, charging: false, onAcPower: false, hasBattery: false }, ALERT_AT_10, false)).toEqual({ action: null, warned: false })
    expect(lowBatteryStep({ ...onBattery(5), percent: null }, ALERT_AT_10, false)).toEqual({ action: null, warned: false })
    expect(lowBatteryStep(null, ALERT_AT_10, false)).toEqual({ action: null, warned: false })
  })
})

describe('lowBatteryNotice', () => {
  it('stays until dismissed and waits for its turn', () => {
    expect(lowBatteryNotice(9)).toEqual({
      id: LOW_BATTERY_NOTICE_ID,
      title: 'Battery low',
      message: '9% remaining',
      tone: 'error',
      timeoutMs: 0,
      waitForTurn: true,
    })
  })
})

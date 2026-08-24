import { describe, it, expect } from 'vitest'
import batterySaverPolicy from './batterySaverPolicy.js'

const {
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
  normalizeOverride,
  clampThresholdPercent,
  clampBrightnessReductionPercent,
  mergeConfig,
  dimmedBrightness,
  isPluggedIn,
  resolveBatterySaverActivation,
  shouldResetOverride,
} = batterySaverPolicy

function battery(overrides) {
  return { percent: 50, charging: false, onAcPower: false, hasBattery: true, ...overrides }
}

function config(overrides) {
  return { ...DEFAULT_CONFIG, ...overrides }
}

function resolve(overrides) {
  const input = {
    config: config(),
    battery: battery(),
    override: DEFAULT_OVERRIDE,
    previouslyActive: false,
    ...overrides,
  }
  if (input.activeThresholdPercent === undefined) {
    input.activeThresholdPercent = input.previouslyActive ? input.config.thresholdPercent : null
  }
  return resolveBatterySaverActivation(input)
}

describe('clampThresholdPercent', () => {
  it('keeps a value inside the allowed range', () => {
    expect(clampThresholdPercent(35)).toBe(35)
  })

  it('clamps to the bounds', () => {
    expect(clampThresholdPercent(0)).toBe(THRESHOLD_MIN_PERCENT)
    expect(clampThresholdPercent(500)).toBe(THRESHOLD_MAX_PERCENT)
  })

  it('rounds fractional values', () => {
    expect(clampThresholdPercent(20.6)).toBe(21)
  })

  it('falls back to the default for junk', () => {
    expect(clampThresholdPercent('twenty')).toBe(THRESHOLD_DEFAULT_PERCENT)
    expect(clampThresholdPercent(undefined)).toBe(THRESHOLD_DEFAULT_PERCENT)
  })
})

describe('clampBrightnessReductionPercent', () => {
  it('clamps to the bounds', () => {
    expect(clampBrightnessReductionPercent(-10)).toBe(BRIGHTNESS_REDUCTION_MIN_PERCENT)
    expect(clampBrightnessReductionPercent(99)).toBe(BRIGHTNESS_REDUCTION_MAX_PERCENT)
  })

  it('falls back to the default for junk', () => {
    expect(clampBrightnessReductionPercent(NaN)).toBe(BRIGHTNESS_REDUCTION_DEFAULT_PERCENT)
  })
})

describe('mergeConfig', () => {
  it('fills missing keys from the defaults', () => {
    expect(mergeConfig({}, {})).toEqual(DEFAULT_CONFIG)
  })

  it('applies a partial update', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { automaticEnabled: false, thresholdPercent: 40 })
    expect(merged.automaticEnabled).toBe(false)
    expect(merged.thresholdPercent).toBe(40)
    expect(merged.dimDisplays).toBe(DEFAULT_CONFIG.dimDisplays)
  })

  it('clamps numbers coming from stored preferences', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { thresholdPercent: 200, brightnessReductionPercent: 1 })
    expect(merged.thresholdPercent).toBe(THRESHOLD_MAX_PERCENT)
    expect(merged.brightnessReductionPercent).toBe(BRIGHTNESS_REDUCTION_MIN_PERCENT)
  })

  it('ignores values of the wrong type', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { automaticEnabled: 'yes', dimDisplays: 1 })
    expect(merged.automaticEnabled).toBe(DEFAULT_CONFIG.automaticEnabled)
    expect(merged.dimDisplays).toBe(DEFAULT_CONFIG.dimDisplays)
  })

  it('survives a corrupt preferences payload', () => {
    expect(mergeConfig(DEFAULT_CONFIG, null)).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig(DEFAULT_CONFIG, 'nonsense')).toEqual(DEFAULT_CONFIG)
  })
})

describe('resolveBatterySaverActivation', () => {
  it('stays off above the threshold', () => {
    expect(resolve({ battery: battery({ percent: 55 }) })).toEqual({ active: false, reason: null })
  })

  it('turns on at the threshold', () => {
    expect(resolve({ battery: battery({ percent: 20 }) })).toEqual({ active: true, reason: 'threshold' })
  })

  it('turns on below the threshold', () => {
    expect(resolve({ battery: battery({ percent: 8 }) })).toEqual({ active: true, reason: 'threshold' })
  })

  it('respects a custom threshold', () => {
    const custom = config({ thresholdPercent: 45 })
    expect(resolve({ config: custom, battery: battery({ percent: 44 }) })).toEqual({ active: true, reason: 'threshold' })
    expect(resolve({ config: custom, battery: battery({ percent: 46 }) })).toEqual({ active: false, reason: null })
  })

  it('never turns on automatically when the master toggle is off', () => {
    expect(resolve({ config: config({ automaticEnabled: false }), battery: battery({ percent: 3 }) })).toEqual({ active: false, reason: null })
  })

  it('turns off instantly once the charger is plugged in', () => {
    const plugged = battery({ percent: 8, onAcPower: true })
    expect(resolve({ battery: plugged, previouslyActive: true })).toEqual({ active: false, reason: null })
  })

  it('treats a charging battery as plugged in even before the AC line reports', () => {
    expect(resolve({ battery: battery({ percent: 8, charging: true }), previouslyActive: true })).toEqual({ active: false, reason: null })
  })

  it('never turns on automatically on a machine without a battery', () => {
    expect(resolve({ battery: battery({ percent: 5, hasBattery: false }) })).toEqual({ active: false, reason: null })
  })

  it('never turns on automatically when the charge is unreadable', () => {
    expect(resolve({ battery: battery({ percent: null }) })).toEqual({ active: false, reason: null })
  })

  it('holds on until the charge clears the exit margin', () => {
    const justAbove = battery({ percent: THRESHOLD_DEFAULT_PERCENT + THRESHOLD_EXIT_MARGIN_PERCENT })
    expect(resolve({ battery: justAbove, previouslyActive: true })).toEqual({ active: true, reason: 'threshold' })
    expect(resolve({ battery: justAbove, previouslyActive: false })).toEqual({ active: false, reason: null })
  })

  it('releases once the charge clears the exit margin', () => {
    const wellAbove = battery({ percent: THRESHOLD_DEFAULT_PERCENT + THRESHOLD_EXIT_MARGIN_PERCENT + 1 })
    expect(resolve({ battery: wellAbove, previouslyActive: true })).toEqual({ active: false, reason: null })
  })

  it('drops the exit margin when the user lowers the threshold under the current charge', () => {
    const lowered = config({ thresholdPercent: 20 })
    const resolution = resolve({
      config: lowered,
      battery: battery({ percent: 22 }),
      previouslyActive: true,
      activeThresholdPercent: 25,
    })
    expect(resolution).toEqual({ active: false, reason: null })
  })

  it('applies a raised threshold immediately without waiting for the exit margin', () => {
    const raised = config({ thresholdPercent: 30 })
    const resolution = resolve({
      config: raised,
      battery: battery({ percent: 22 }),
      previouslyActive: true,
      activeThresholdPercent: 25,
    })
    expect(resolution).toEqual({ active: true, reason: 'threshold' })
  })

  it('keeps the exit margin for charge drift while the threshold stays put', () => {
    const resolution = resolve({
      battery: battery({ percent: THRESHOLD_DEFAULT_PERCENT + THRESHOLD_EXIT_MARGIN_PERCENT }),
      previouslyActive: true,
      activeThresholdPercent: THRESHOLD_DEFAULT_PERCENT,
    })
    expect(resolution).toEqual({ active: true, reason: 'threshold' })
  })

  it('lets an on override win over a full battery on AC', () => {
    const full = battery({ percent: 100, onAcPower: true, charging: true })
    expect(resolve({ battery: full, override: 'on' })).toEqual({ active: true, reason: 'manual' })
  })

  it('lets an on override win over the master toggle being off', () => {
    expect(resolve({ config: config({ automaticEnabled: false }), override: 'on' })).toEqual({ active: true, reason: 'manual' })
  })

  it('reports the manual reason when both the override and the threshold apply', () => {
    expect(resolve({ battery: battery({ percent: 5 }), override: 'on' })).toEqual({ active: true, reason: 'manual' })
  })

  it('lets an off override win over the threshold', () => {
    expect(resolve({ battery: battery({ percent: 5 }), override: 'off' })).toEqual({ active: false, reason: null })
  })

  it('keeps an off override in force as the charge keeps falling', () => {
    expect(resolve({ battery: battery({ percent: 2 }), override: 'off', previouslyActive: true })).toEqual({ active: false, reason: null })
  })
})

describe('normalizeOverride', () => {
  it('keeps the three known overrides', () => {
    expect(normalizeOverride('auto')).toBe('auto')
    expect(normalizeOverride('on')).toBe('on')
    expect(normalizeOverride('off')).toBe('off')
  })

  it('falls back to automatic for anything else', () => {
    expect(normalizeOverride('maybe')).toBe(DEFAULT_OVERRIDE)
    expect(normalizeOverride(true)).toBe(DEFAULT_OVERRIDE)
    expect(normalizeOverride(undefined)).toBe(DEFAULT_OVERRIDE)
  })
})

describe('shouldResetOverride', () => {
  it('resets the override when the charger is connected', () => {
    expect(shouldResetOverride(battery({ onAcPower: false }), battery({ onAcPower: true }))).toBe(true)
  })

  it('keeps the override while still on battery', () => {
    expect(shouldResetOverride(battery({ onAcPower: false }), battery({ onAcPower: false }))).toBe(false)
  })

  it('does not reset the override again while the charger stays connected', () => {
    expect(shouldResetOverride(battery({ onAcPower: true }), battery({ onAcPower: true }))).toBe(false)
  })

  it('does not reset the override when the charger is unplugged', () => {
    expect(shouldResetOverride(battery({ onAcPower: true }), battery({ onAcPower: false }))).toBe(false)
  })
})

describe('dimmedBrightness', () => {
  it('reduces the baseline by the requested share', () => {
    expect(dimmedBrightness(100, 30)).toBe(70)
    expect(dimmedBrightness(50, 40)).toBe(30)
  })

  it('never dims below the floor', () => {
    expect(dimmedBrightness(20, 60)).toBe(MIN_SAVER_BRIGHTNESS_PERCENT)
  })

  it('never raises a baseline that already sits under the floor', () => {
    expect(dimmedBrightness(4, 60)).toBe(4)
  })

  it('is idempotent when re-applied to its own baseline', () => {
    const baseline = 80
    expect(dimmedBrightness(baseline, 30)).toBe(dimmedBrightness(baseline, 30))
  })
})

describe('isPluggedIn', () => {
  it('counts an AC line and a charging battery', () => {
    expect(isPluggedIn(battery({ onAcPower: true }))).toBe(true)
    expect(isPluggedIn(battery({ charging: true }))).toBe(true)
  })

  it('reports a discharging battery as unplugged', () => {
    expect(isPluggedIn(battery())).toBe(false)
    expect(isPluggedIn(null)).toBe(false)
  })
})

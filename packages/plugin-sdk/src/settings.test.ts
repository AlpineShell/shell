import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PLUGIN_SETTING_KEY_PATTERN, PLUGIN_SETTING_TYPES } from './constants'
import { isValidPluginSettingValue, validateManifestShape, validatePluginSettings } from './validate'
import { usePluginSetting } from './hooks'
import type { PluginSettingContribution } from './contributions'

const UNIT: PluginSettingContribution = {
  key: 'unit',
  type: 'select',
  label: 'Unit',
  default: 'c',
  options: [
    { value: 'c', label: 'Celsius' },
    { value: 'f', label: 'Fahrenheit' },
  ],
}

const SHOW_WIND: PluginSettingContribution = { key: 'show-wind', type: 'toggle', label: 'Show wind', info: 'Adds the wind speed.', default: false }

const REFRESH: PluginSettingContribution = { key: 'refresh_minutes', type: 'slider', label: 'Refresh every', default: 10, min: 5, max: 60, step: 5, unit: 'min' }

function problemFor(setting: unknown): string {
  const { settings, issues } = validatePluginSettings([setting])
  expect(settings).toEqual([])
  expect(issues).toHaveLength(1)
  return issues[0].message
}

describe('validatePluginSettings', () => {
  it('keeps well-formed toggles, selects and sliders as declared', () => {
    const { settings, issues } = validatePluginSettings([SHOW_WIND, UNIT, REFRESH])
    expect(issues).toEqual([])
    expect(settings).toEqual([SHOW_WIND, UNIT, REFRESH])
  })

  it('keeps only the fields a setting of its type uses', () => {
    const { settings } = validatePluginSettings([{ ...SHOW_WIND, options: UNIT.options, min: 1, max: 2, extra: true }])
    expect(settings).toEqual([SHOW_WIND])
  })

  it('reads a missing list as no settings', () => {
    expect(validatePluginSettings(undefined)).toEqual({ settings: [], issues: [] })
  })

  it('refuses a settings value that is not a list', () => {
    expect(validatePluginSettings({ unit: UNIT }).issues).toEqual([{ path: 'contributes.settings', message: 'must be a list of settings' }])
  })

  it.each([
    ['a space', 'show wind'],
    ['a slash', 'weather/unit'],
    ['nothing at all', ''],
  ])('refuses a key with %s in it', (_, key) => {
    expect(problemFor({ ...SHOW_WIND, key })).toContain("'key'")
  })

  it('drops the second of two settings sharing a key, naming the key', () => {
    const { settings, issues } = validatePluginSettings([UNIT, { ...SHOW_WIND, key: 'unit' }])
    expect(settings).toEqual([UNIT])
    expect(issues).toEqual([{ path: 'contributes.settings.unit', message: 'another setting already uses this key' }])
  })

  it('refuses an unknown type', () => {
    expect(problemFor({ ...SHOW_WIND, type: 'color' })).toContain("'type'")
  })

  it('refuses a setting without a label', () => {
    expect(problemFor({ ...SHOW_WIND, label: ' ' })).toContain("'label'")
  })

  it('refuses a toggle whose default is not true or false', () => {
    expect(problemFor({ ...SHOW_WIND, default: 'yes' })).toContain('toggle')
  })

  it('refuses a select whose default is not one of its options', () => {
    expect(problemFor({ ...UNIT, default: 'k' })).toContain('one of its options')
  })

  it('refuses a select without options, or with an option listed twice', () => {
    expect(problemFor({ ...UNIT, options: [] })).toContain("'options'")
    expect(problemFor({ ...UNIT, options: [...UNIT.options, { value: 'c', label: 'Again' }] })).toContain('twice')
  })

  it('refuses a slider whose min is not below its max', () => {
    expect(problemFor({ ...REFRESH, min: 60, max: 60, default: 60 })).toContain("'min' must be less than its 'max'")
  })

  it('refuses a slider whose default lies outside its range', () => {
    expect(problemFor({ ...REFRESH, default: 90 })).toContain("from 'min' to 'max'")
  })

  it('refuses a slider without a range or with a step that is not positive', () => {
    expect(problemFor({ ...REFRESH, min: undefined })).toContain("'min' and 'max'")
    expect(problemFor({ ...REFRESH, step: 0 })).toContain("'step'")
  })

  it('keeps the valid settings next to an invalid one', () => {
    const { settings, issues } = validatePluginSettings([SHOW_WIND, { ...UNIT, default: 'k' }, REFRESH])
    expect(settings).toEqual([SHOW_WIND, REFRESH])
    expect(issues.map((issue) => issue.path)).toEqual(['contributes.settings.unit'])
  })

  it('skips a setting meant for a newer api version without complaint', () => {
    expect(validatePluginSettings([{ ...SHOW_WIND, since: 99 }], 1)).toEqual({ settings: [], issues: [] })
  })
})

describe('isValidPluginSettingValue', () => {
  it('accepts only true or false for a toggle', () => {
    expect(isValidPluginSettingValue(SHOW_WIND, true)).toBe(true)
    expect(isValidPluginSettingValue(SHOW_WIND, 'true')).toBe(false)
  })

  it('accepts only a declared option for a select', () => {
    expect(isValidPluginSettingValue(UNIT, 'f')).toBe(true)
    expect(isValidPluginSettingValue(UNIT, 'k')).toBe(false)
  })

  it('accepts only a number inside the range for a slider', () => {
    expect(isValidPluginSettingValue(REFRESH, 5)).toBe(true)
    expect(isValidPluginSettingValue(REFRESH, 61)).toBe(false)
    expect(isValidPluginSettingValue(REFRESH, Number.NaN)).toBe(false)
  })
})

describe('validateManifestShape and settings', () => {
  it('reports an invalid setting as a manifest issue', () => {
    const result = validateManifestShape({ name: 'Weather', version: '1.0.0', contributes: { settings: [{ ...UNIT, default: 'k' }] } })
    expect(result).toEqual({ ok: false, issues: [{ path: 'contributes.settings.unit', message: "a select's 'default' must be the value of one of its options" }] })
  })

  it('passes a manifest whose settings are valid', () => {
    expect(validateManifestShape({ name: 'Weather', version: '1.0.0', contributes: { settings: [UNIT] } })).toEqual({ ok: true })
  })
})

describe('usePluginSetting', () => {
  const globals = globalThis as unknown as { alpine?: unknown }

  afterEach(() => {
    delete globals.alpine
  })

  it('asks the host for the setting of the plugin it names', () => {
    const calls: [string, string][] = []
    const setUnit = () => {}
    globals.alpine = {
      usePluginSetting: (pluginId: string, key: string) => {
        calls.push([pluginId, key])
        return ['f', setUnit]
      },
    }
    expect(usePluginSetting('com.example.weather', 'unit')).toEqual(['f', setUnit])
    expect(calls).toEqual([['com.example.weather', 'unit']])
  })

  it('says so when the host has no plugin settings', () => {
    globals.alpine = {}
    expect(() => usePluginSetting('com.example.weather', 'unit')).toThrow('no plugin settings')
  })
})

describe('settings schema parity (anti-drift)', () => {
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schema/plugin-v1.json', import.meta.url)), 'utf8'))
  const settingSchema = schema.properties.contributes.properties.settings.items

  it('setting type enum equals PLUGIN_SETTING_TYPES', () => {
    expect(settingSchema.properties.type.enum).toEqual([...PLUGIN_SETTING_TYPES])
  })

  it('setting key pattern equals PLUGIN_SETTING_KEY_PATTERN', () => {
    expect(settingSchema.properties.key.pattern).toBe(PLUGIN_SETTING_KEY_PATTERN.source)
  })
})

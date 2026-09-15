import {
  PLUGIN_API_VERSION,
  PLUGIN_ID_PATTERN,
  PLUGIN_SETTING_KEY_PATTERN,
  PLUGIN_SETTING_TYPES,
  isSupportedApiVersion,
} from './constants'
import type {
  PluginSettingContribution,
  PluginSettingOption,
  PluginSettingType,
  PluginSettingValue,
} from './contributions'

export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export interface ValidationIssue {
  path: string
  message: string
}
export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

export interface PluginSettingsValidation {
  settings: PluginSettingContribution[]
  issues: ValidationIssue[]
}

type RawSetting = Record<string, unknown>

type SettingBase = Pick<PluginSettingContribution, 'key' | 'label' | 'info'>

type SettingCheck = { setting: PluginSettingContribution } | { problem: string }

const SETTINGS_PATH = 'contributes.settings'

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && PLUGIN_ID_PATTERN.test(id)
}

export function isSemver(v: unknown): v is string {
  return typeof v === 'string' && SEMVER_PATTERN.test(v)
}

export function isHttpsOrigin(s: unknown): boolean {
  if (typeof s !== 'string' || !s || s === '*') return false
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.pathname !== '' && url.pathname !== '/') return false
  if (url.search || url.hash || url.username || url.password) return false
  const host = url.hostname
  if (!host) return false
  if (host.startsWith('*.')) {
    const rest = host.slice(2)
    return rest.length > 0 && rest.includes('.') && !rest.includes('*')
  }
  return !host.includes('*')
}

export function normalizeRelPath(p: string): string | null {
  if (typeof p !== 'string' || !p) return null
  if (/^([a-zA-Z]:)?[\\/]/.test(p)) return null
  const parts = p.split(/[\\/]/)
  if (parts.some((seg) => seg === '..')) return null
  if (parts[parts.length - 1] === '') return null
  return parts.filter((seg) => seg !== '.').join('/')
}

function isRawSetting(value: unknown): value is RawSetting {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isSettingType(value: unknown): value is PluginSettingType {
  return (PLUGIN_SETTING_TYPES as readonly unknown[]).includes(value)
}

function isSettingKey(value: unknown): value is string {
  return typeof value === 'string' && PLUGIN_SETTING_KEY_PATTERN.test(value)
}

function settingPath(raw: unknown, index: number): string {
  return isRawSetting(raw) && isSettingKey(raw.key) ? `${SETTINGS_PATH}.${raw.key}` : `${SETTINGS_PATH}[${index}]`
}

function checkOptions(raw: unknown): PluginSettingOption[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "a select needs 'options', a list of { value, label }"
  const options: PluginSettingOption[] = []
  for (const option of raw) {
    if (!isRawSetting(option) || typeof option.value !== 'string' || typeof option.label !== 'string' || !option.label.trim()) {
      return "each option needs a string 'value' and a non-empty 'label'"
    }
    if (options.some((kept) => kept.value === option.value)) return `option '${option.value}' is listed twice`
    options.push({ value: option.value, label: option.label })
  }
  return options
}

function toggleSetting(base: SettingBase, raw: RawSetting): SettingCheck {
  if (typeof raw.default !== 'boolean') return { problem: "a toggle's 'default' must be true or false" }
  return { setting: { ...base, type: 'toggle', default: raw.default } }
}

function selectSetting(base: SettingBase, raw: RawSetting): SettingCheck {
  const options = checkOptions(raw.options)
  if (typeof options === 'string') return { problem: options }
  if (typeof raw.default !== 'string' || !options.some((option) => option.value === raw.default)) {
    return { problem: "a select's 'default' must be the value of one of its options" }
  }
  return { setting: { ...base, type: 'select', default: raw.default, options } }
}

function sliderSetting(base: SettingBase, raw: RawSetting): SettingCheck {
  const { min, max, step, unit } = raw
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return { problem: "a slider needs numeric 'min' and 'max'" }
  if (min >= max) return { problem: "a slider's 'min' must be less than its 'max'" }
  if (step != null && (!isFiniteNumber(step) || step <= 0)) return { problem: "a slider's 'step' must be a positive number" }
  if (unit != null && typeof unit !== 'string') return { problem: "a slider's 'unit' must be a string" }
  if (!isFiniteNumber(raw.default) || raw.default < min || raw.default > max) {
    return { problem: "a slider's 'default' must be a number from 'min' to 'max'" }
  }
  return {
    setting: {
      ...base,
      type: 'slider',
      default: raw.default,
      min,
      max,
      ...(isFiniteNumber(step) ? { step } : {}),
      ...(typeof unit === 'string' ? { unit } : {}),
    },
  }
}

const SETTING_CHECKS: Record<PluginSettingType, (base: SettingBase, raw: RawSetting) => SettingCheck> = {
  toggle: toggleSetting,
  select: selectSetting,
  slider: sliderSetting,
}

function checkSetting(raw: unknown): SettingCheck {
  if (!isRawSetting(raw)) return { problem: 'each setting must be an object' }
  if (!isSettingKey(raw.key)) return { problem: "'key' must use only letters, digits, '_', '.' and '-'" }
  if (!isSettingType(raw.type)) return { problem: "'type' must be toggle, select or slider" }
  if (typeof raw.label !== 'string' || !raw.label.trim()) return { problem: "'label' must be a non-empty string" }
  if (raw.info != null && typeof raw.info !== 'string') return { problem: "'info' must be a string" }
  const base: SettingBase = { key: raw.key, label: raw.label, ...(typeof raw.info === 'string' ? { info: raw.info } : {}) }
  return SETTING_CHECKS[raw.type](base, raw)
}

function arrivesLater(raw: unknown, apiVersion: number): boolean {
  return isRawSetting(raw) && typeof raw.since === 'number' && raw.since > apiVersion
}

export function validatePluginSettings(raw: unknown, apiVersion: number = PLUGIN_API_VERSION): PluginSettingsValidation {
  const settings: PluginSettingContribution[] = []
  const issues: ValidationIssue[] = []
  if (raw == null) return { settings, issues }
  if (!Array.isArray(raw)) return { settings, issues: [{ path: SETTINGS_PATH, message: 'must be a list of settings' }] }
  raw.forEach((entry, index) => {
    if (arrivesLater(entry, apiVersion)) return
    const path = settingPath(entry, index)
    const check = checkSetting(entry)
    if ('problem' in check) {
      issues.push({ path, message: check.problem })
      return
    }
    if (settings.some((kept) => kept.key === check.setting.key)) {
      issues.push({ path, message: 'another setting already uses this key' })
      return
    }
    settings.push(check.setting)
  })
  return { settings, issues }
}

export function isValidPluginSettingValue(setting: PluginSettingContribution, value: unknown): value is PluginSettingValue {
  if (setting.type === 'toggle') return typeof value === 'boolean'
  if (setting.type === 'select') return typeof value === 'string' && setting.options.some((option) => option.value === value)
  return isFiniteNumber(value) && value >= setting.min && value <= setting.max
}

function contributedSettings(manifest: Record<string, unknown>): unknown {
  const contributes = manifest.contributes
  return isRawSetting(contributes) ? contributes.settings : undefined
}

export function validateManifestShape(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (!raw || typeof raw !== 'object') return { ok: false, issues: [{ path: '', message: 'manifest must be an object' }] }
  const m = raw as Record<string, unknown>
  if (m.id != null && !isValidId(m.id)) add('id', 'must be a reverse-DNS lowercase id')
  if (typeof m.name !== 'string' || !m.name) add('name', 'required string')
  if (!isSemver(m.version)) add('version', 'must be semver 2.0.0')
  if (m.apiVersion != null) {
    if (!Number.isInteger(m.apiVersion)) add('apiVersion', 'must be an integer')
    else if (!isSupportedApiVersion(m.apiVersion as number)) add('apiVersion', 'unsupported api version')
  }
  issues.push(...validatePluginSettings(contributedSettings(m)).issues)
  return issues.length ? { ok: false, issues } : { ok: true }
}

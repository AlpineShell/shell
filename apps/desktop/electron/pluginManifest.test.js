import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { validatePluginSettings } from '@alpine/plugin-sdk'
import { parseManifest } from './pluginManifest.js'

let dir

function write(manifest) {
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest))
  return parseManifest(dir, path.basename(dir), { appVersion: '1.0.0' }).record
}

function baseManifest(contributes) {
  return { id: path.basename(dir), name: 'Android', version: '1.0.0', contributes }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'com.alpine.test-'))
  fs.writeFileSync(path.join(dir, 'index.js'), 'export default () => null')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('contributes.fileHandlers', () => {
  it('keeps a handler and normalises its extensions', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['.APK', '.xapk', '.apk'], command: 'install', name: 'Android app' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.fileHandlers).toHaveLength(1)
    expect(record.contributes.fileHandlers[0].extensions).toEqual(['.apk', '.xapk'])
    expect(record.contributes.fileHandlers[0].command).toBe('install')
    expect(record.contributes.fileHandlers[0].name).toBe('Android app')
  })

  it('rejects extensions without a leading dot', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['apk'], command: 'install' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.fileHandlers).toBeUndefined()
  })

  it('rejects a handler without a command', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['.apk'] }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.fileHandlers).toBeUndefined()
  })

  it('defaults the type name to null', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['.apk'], command: 'install' }] }))
    expect(record.contributes.fileHandlers[0].name).toBeNull()
  })
})

describe('contributes.launcherFolders', () => {
  it('keeps a plain folder name', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: ' Android apps ' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.launcherFolders[0].startMenuFolder).toBe('Android apps')
  })

  it('defaults the badge to null', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps' }] }))
    expect(record.contributes.launcherFolders[0].badge).toBeNull()
  })

  it('keeps a badge that exists inside the plugin folder', () => {
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'assets', 'badge.png'), 'x')
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', badge: 'assets/badge.png' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.launcherFolders[0].badge).toBe('assets/badge.png')
  })

  it('rejects a badge that escapes the plugin folder', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', badge: '../../evil.png' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.launcherFolders).toBeUndefined()
  })

  it('rejects a badge that does not exist', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', badge: 'assets/missing.png' }] }))
    expect(record.valid).toBe(false)
  })

  it('defaults the uninstall command to null', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps' }] }))
    expect(record.contributes.launcherFolders[0].uninstallCommand).toBeNull()
  })

  it('keeps an uninstall command', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', uninstallCommand: 'uninstall' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.launcherFolders[0].uninstallCommand).toBe('uninstall')
  })

  it('rejects an empty uninstall command', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', uninstallCommand: '' }] }))
    expect(record.valid).toBe(false)
  })

  it('rejects a path instead of a folder name', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: '..\\Startup' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.launcherFolders).toBeUndefined()
  })
})

describe('contributes.windowRules', () => {
  const WSLG_RULE = { process: 'MSRDC.exe', className: 'RAIL_WINDOW', titleSuffix: ' (Ubuntu)', startMenuFolder: ' Ubuntu ', border: 'none', contentInset: 12 }

  it('keeps a rule and normalises the process and folder', () => {
    const record = write(baseManifest({ windowRules: [WSLG_RULE] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.windowRules).toEqual([
      { process: 'msrdc.exe', className: 'RAIL_WINDOW', titleSuffix: ' (Ubuntu)', startMenuFolder: 'Ubuntu', border: 'none', contentInset: 12 },
    ])
  })

  it('fills in defaults for the optional fields', () => {
    const record = write(baseManifest({ windowRules: [{ process: 'msrdc.exe', className: 'RAIL_WINDOW' }] }))
    expect(record.contributes.windowRules[0]).toEqual({
      process: 'msrdc.exe',
      className: 'RAIL_WINDOW',
      titleSuffix: null,
      startMenuFolder: null,
      border: 'default',
      contentInset: 0,
    })
  })

  it('rejects a process given as a path', () => {
    const record = write(baseManifest({ windowRules: [{ ...WSLG_RULE, process: 'system32\\msrdc.exe' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.windowRules).toBeUndefined()
  })

  it('rejects a rule without a window class', () => {
    const record = write(baseManifest({ windowRules: [{ ...WSLG_RULE, className: '' }] }))
    expect(record.valid).toBe(false)
  })

  it('rejects an unknown border', () => {
    const record = write(baseManifest({ windowRules: [{ ...WSLG_RULE, border: 'thick' }] }))
    expect(record.valid).toBe(false)
  })

  it('rejects an inset that is not a small whole number', () => {
    expect(write(baseManifest({ windowRules: [{ ...WSLG_RULE, contentInset: 2.5 }] })).valid).toBe(false)
    expect(write(baseManifest({ windowRules: [{ ...WSLG_RULE, contentInset: 500 }] })).valid).toBe(false)
  })

  it('rejects a start menu folder that is a path', () => {
    const record = write(baseManifest({ windowRules: [{ ...WSLG_RULE, startMenuFolder: '..\\Startup' }] }))
    expect(record.valid).toBe(false)
  })
})

describe('contributes.launcherFolders openCommand', () => {
  it('defaults to null', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps' }] }))
    expect(record.contributes.launcherFolders[0].openCommand).toBeNull()
  })

  it('keeps a declared open command', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', openCommand: 'open' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.launcherFolders[0].openCommand).toBe('open')
  })

  it('rejects an empty open command', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', openCommand: '' }] }))
    expect(record.valid).toBe(false)
  })
})

const UNIT_SETTING = {
  key: 'unit',
  type: 'select',
  label: 'Unit',
  default: 'c',
  options: [
    { value: 'c', label: 'Celsius' },
    { value: 'f', label: 'Fahrenheit' },
  ],
}

const WIND_SETTING = { key: 'show-wind', type: 'toggle', label: 'Show wind', info: 'Adds the wind speed.', default: false }

describe('contributes.settings', () => {
  it('keeps valid settings on the record', () => {
    const record = write(baseManifest({ settings: [UNIT_SETTING, WIND_SETTING] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.settings).toEqual([UNIT_SETTING, WIND_SETTING])
  })

  it('drops an invalid setting and says which one and why', () => {
    const refresh = { key: 'refresh', type: 'slider', label: 'Refresh', default: 5, min: 10, max: 1 }
    const record = write(baseManifest({ settings: [UNIT_SETTING, refresh] }))
    expect(record.contributes.settings).toEqual([UNIT_SETTING])
    expect(record.errors).toEqual(["contributes.settings.refresh: a slider's 'min' must be less than its 'max'"])
  })

  it('drops a setting whose key another setting already uses', () => {
    const record = write(baseManifest({ settings: [UNIT_SETTING, { ...WIND_SETTING, key: 'unit' }] }))
    expect(record.contributes.settings).toEqual([UNIT_SETTING])
    expect(record.errors).toEqual(['contributes.settings.unit: another setting already uses this key'])
  })

  it('applies exactly the rules the SDK applies', () => {
    const declared = [
      UNIT_SETTING,
      { ...UNIT_SETTING, key: 'fallback', default: 'k' },
      { key: 'bad key', type: 'toggle', label: 'Bad', default: true },
      WIND_SETTING,
      { key: 'later', type: 'toggle', label: 'Later', default: true, since: 99 },
    ]
    const sdk = validatePluginSettings(declared, 1)
    const record = write(baseManifest({ settings: declared }))
    expect(record.contributes.settings).toEqual(sdk.settings)
    expect(record.errors).toEqual(sdk.issues.map((issue) => `${issue.path}: ${issue.message}`))
  })

  it('leaves settings off the record when none are declared', () => {
    expect(write(baseManifest({})).contributes.settings).toBeUndefined()
  })
})

describe('contributes.settingsPages', () => {
  it('keeps a page and leaves its export unset when none is named', () => {
    const record = write(baseManifest({ settingsPages: [{ label: 'Weather' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.settingsPages).toEqual([{ label: 'Weather', icon: null, topLevel: false, export: null }])
  })

  it('keeps a named export, a lucide icon and a place in the sidebar', () => {
    const page = { label: 'Weather', export: 'WeatherSettings', icon: 'lucide:CloudSun', topLevel: true }
    const record = write(baseManifest({ settingsPages: [page] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.settingsPages).toEqual([page])
  })

  it('keeps an icon that exists inside the plugin folder', () => {
    fs.writeFileSync(path.join(dir, 'gear.png'), 'x')
    const record = write(baseManifest({ settingsPages: [{ label: 'Weather', icon: 'gear.png' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.settingsPages[0].icon).toBe('gear.png')
  })

  it('rejects a page without a label', () => {
    const record = write(baseManifest({ settingsPages: [{ export: 'WeatherSettings' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.settingsPages).toBeUndefined()
  })

  it('rejects an icon that escapes the plugin folder', () => {
    const record = write(baseManifest({ settingsPages: [{ label: 'Weather', icon: '../../evil.png' }] }))
    expect(record.valid).toBe(false)
  })

  it('rejects a topLevel that is not true or false', () => {
    const record = write(baseManifest({ settingsPages: [{ label: 'Weather', topLevel: 'yes' }] }))
    expect(record.valid).toBe(false)
  })
})

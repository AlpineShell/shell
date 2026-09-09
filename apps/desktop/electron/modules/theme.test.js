import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
const syncListeners = new Map()

let userDataDir = ''
let nativeTheme = null

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    app: { getPath: () => userDataDir },
    ipcMain: { on: (channel, listener) => syncListeners.set(channel, listener) },
    get nativeTheme() {
      return nativeTheme
    },
  },
}

const LIGHT_THEME = { name: 'light', background: '#f9fafb' }
const DARK_THEME = { name: 'dark', background: '#1a1a19' }

function createNativeTheme(systemThemeName) {
  const updatedListeners = []
  const notifyUpdated = () => updatedListeners.forEach((listener) => listener())
  let themeSource = 'system'
  const stub = {
    shouldUseDarkColors: systemThemeName === 'dark',
    on: (event, listener) => {
      if (event === 'updated') updatedListeners.push(listener)
    },
    get themeSource() {
      return themeSource
    },
    set themeSource(value) {
      themeSource = value
      notifyUpdated()
    },
    switchSystemTo: (name) => {
      stub.shouldUseDarkColors = name === 'dark'
      notifyUpdated()
    },
  }
  return stub
}

const storeFile = () => path.join(userDataDir, 'theme.json')
const writeStore = (contents) => fs.writeFileSync(storeFile(), contents)
const writePreference = (preference) => writeStore(JSON.stringify({ preference }))
const readStore = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'))

async function loadModule() {
  vi.resetModules()
  const { default: theme } = await import('./theme.js')
  return theme
}

async function startModule() {
  const theme = await loadModule()
  const broadcasts = []
  theme.start((channel, payload) => broadcasts.push({ channel, payload }))
  return { theme, broadcasts }
}

const setPreference = (theme, value) => theme.handlers['theme/set-preference'](null, value)

beforeEach(() => {
  syncListeners.clear()
  nativeTheme = createNativeTheme('dark')
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-theme-'))
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('resolveThemeName', () => {
  it('maps the native dark flag to the dark theme', async () => {
    const theme = await loadModule()
    expect(theme.resolveThemeName(true)).toBe('dark')
  })

  it('maps the native light flag to the light theme', async () => {
    const theme = await loadModule()
    expect(theme.resolveThemeName(false)).toBe('light')
  })
})

describe('windowBackgroundFor', () => {
  it('gives each theme its own chrome colour', async () => {
    const theme = await loadModule()
    expect(theme.windowBackgroundFor('light')).toBe('#f9fafb')
    expect(theme.windowBackgroundFor('dark')).toBe('#1a1a19')
  })

  it('falls back to the dark chrome colour for an unknown theme', async () => {
    const theme = await loadModule()
    expect(theme.windowBackgroundFor('sepia')).toBe('#1a1a19')
  })
})

describe('toThemePreference', () => {
  it('lets the three real preferences through', async () => {
    const theme = await loadModule()
    expect(theme.toThemePreference('system')).toBe('system')
    expect(theme.toThemePreference('light')).toBe('light')
    expect(theme.toThemePreference('dark')).toBe('dark')
  })

  it('falls back to following the system for anything that is not a preference', async () => {
    const theme = await loadModule()
    const rejected = ['sepia', 'Dark', '', null, undefined, 0, 1, {}, ['light']]
    rejected.forEach((value) => expect(theme.toThemePreference(value)).toBe('system'))
  })
})

describe('the theme getTheme reports', () => {
  it('follows a dark system theme while the preference is system', async () => {
    nativeTheme = createNativeTheme('dark')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...DARK_THEME, preference: 'system' })
  })

  it('follows a light system theme while the preference is system', async () => {
    nativeTheme = createNativeTheme('light')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...LIGHT_THEME, preference: 'system' })
  })

  it('holds the light theme against a dark system theme', async () => {
    nativeTheme = createNativeTheme('dark')
    writePreference('light')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...LIGHT_THEME, preference: 'light' })
  })

  it('holds the dark theme against a light system theme', async () => {
    nativeTheme = createNativeTheme('light')
    writePreference('dark')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...DARK_THEME, preference: 'dark' })
  })

  it('never names the resolved theme after the system preference', async () => {
    for (const preference of ['system', 'light', 'dark']) {
      writePreference(preference)
      const theme = await loadModule()
      expect(['light', 'dark']).toContain(theme.getTheme().name)
    }
  })

  it('falls back to the dark theme when the nativeTheme bridge is unavailable', async () => {
    nativeTheme = undefined
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...DARK_THEME, preference: 'system' })
    expect(theme.getWindowBackground()).toBe('#1a1a19')
  })
})

describe('loading the stored preference', () => {
  it('follows the system when nothing has been stored', async () => {
    nativeTheme = createNativeTheme('light')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...LIGHT_THEME, preference: 'system' })
  })

  it('colours the window from the stored preference before start has been called', async () => {
    nativeTheme = createNativeTheme('dark')
    writePreference('light')
    const theme = await loadModule()
    expect(theme.getWindowBackground()).toBe('#f9fafb')
    expect(theme.getTheme().preference).toBe('light')
  })

  it('hands the stored preference to nativeTheme before start has been called', async () => {
    writePreference('light')
    const theme = await loadModule()
    theme.getWindowBackground()
    expect(nativeTheme.themeSource).toBe('light')
  })

  it('falls back to following the system when the store is corrupt', async () => {
    nativeTheme = createNativeTheme('light')
    writeStore('{ preference: not json')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...LIGHT_THEME, preference: 'system' })
  })

  it('falls back to following the system when the stored value is not a preference', async () => {
    nativeTheme = createNativeTheme('light')
    writePreference('sepia')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual({ ...LIGHT_THEME, preference: 'system' })
  })
})

describe('choosing a preference', () => {
  it('writes the chosen preference to the store', async () => {
    const { theme } = await startModule()
    setPreference(theme, 'dark')
    expect(readStore()).toEqual({ preference: 'dark' })
  })

  it('stores a value that is not a preference as following the system', async () => {
    const { theme } = await startModule()
    setPreference(theme, 'sepia')
    expect(readStore()).toEqual({ preference: 'system' })
  })

  it('gives the next session the preference the last one chose', async () => {
    const first = await startModule()
    setPreference(first.theme, 'dark')

    nativeTheme = createNativeTheme('light')
    const second = await loadModule()

    expect(second.getTheme()).toEqual({ ...DARK_THEME, preference: 'dark' })
  })

  it('returns the resolved theme to the caller that chose it', async () => {
    nativeTheme = createNativeTheme('dark')
    const { theme } = await startModule()
    expect(setPreference(theme, 'light')).toEqual({ ...LIGHT_THEME, preference: 'light' })
  })

  it('answers theme/get with the resolved theme and the preference behind it', async () => {
    nativeTheme = createNativeTheme('dark')
    const { theme } = await startModule()
    setPreference(theme, 'light')
    expect(theme.handlers['theme/get']()).toEqual({ ...LIGHT_THEME, preference: 'light' })
  })
})

describe('broadcasting a chosen preference', () => {
  it('broadcasts once when the choice changes the resolved theme', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme, broadcasts } = await startModule()

    setPreference(theme, 'dark')

    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: { ...DARK_THEME, preference: 'dark' } }])
  })

  it('broadcasts a choice that pins the theme the system already shows', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme, broadcasts } = await startModule()

    setPreference(theme, 'light')

    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: { ...LIGHT_THEME, preference: 'light' } }])
  })

  it('broadcasts nothing when the preference is set to the one already in use', async () => {
    const { theme, broadcasts } = await startModule()
    setPreference(theme, 'system')
    expect(broadcasts).toEqual([])
  })

  it('broadcasts nothing when the stored preference is chosen again', async () => {
    writePreference('dark')
    const { theme, broadcasts } = await startModule()
    setPreference(theme, 'dark')
    expect(broadcasts).toEqual([])
  })
})

describe('a system theme change', () => {
  it('carries through while the preference is system', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme, broadcasts } = await startModule()

    nativeTheme.switchSystemTo('dark')

    expect(theme.getTheme()).toEqual({ ...DARK_THEME, preference: 'system' })
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: { ...DARK_THEME, preference: 'system' } }])
  })

  it('leaves a chosen light theme alone', async () => {
    nativeTheme = createNativeTheme('light')
    writePreference('light')
    const { theme, broadcasts } = await startModule()

    nativeTheme.switchSystemTo('dark')

    expect(theme.getTheme()).toEqual({ ...LIGHT_THEME, preference: 'light' })
    expect(broadcasts).toEqual([])
  })

  it('leaves a chosen dark theme alone', async () => {
    nativeTheme = createNativeTheme('dark')
    writePreference('dark')
    const { theme, broadcasts } = await startModule()

    nativeTheme.switchSystemTo('light')

    expect(theme.getTheme()).toEqual({ ...DARK_THEME, preference: 'dark' })
    expect(broadcasts).toEqual([])
  })
})

describe('the synchronous boot read', () => {
  it('answers with the resolved theme and the preference behind it', async () => {
    nativeTheme = createNativeTheme('light')
    writePreference('dark')
    await startModule()

    const event = {}
    syncListeners.get('theme/init')(event)

    expect(event.returnValue).toEqual({ ...DARK_THEME, preference: 'dark' })
  })

  it('answers with the preference chosen since start', async () => {
    nativeTheme = createNativeTheme('dark')
    const { theme } = await startModule()
    const next = setPreference(theme, 'light')

    const event = {}
    syncListeners.get('theme/init')(event)

    expect(event.returnValue).toEqual(next)
  })
})

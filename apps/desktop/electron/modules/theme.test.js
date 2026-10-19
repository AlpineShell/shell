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

const LIGHT_THEME = { name: 'light', background: '#d6d6d6' }
const DARK_THEME = { name: 'dark', background: '#202020' }

function createNativeTheme(windowsThemeName) {
  const updatedListeners = []
  const notifyUpdated = () => updatedListeners.forEach((listener) => listener())
  let themeSource = 'system'
  const stub = {
    shouldUseDarkColors: windowsThemeName === 'dark',
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
    switchWindowsTo: (name) => {
      stub.shouldUseDarkColors = name === 'dark'
      notifyUpdated()
    },
  }
  return stub
}

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

function readBootTheme() {
  const event = {}
  syncListeners.get('theme/init')(event)
  return event.returnValue
}

beforeEach(() => {
  syncListeners.clear()
  nativeTheme = createNativeTheme('dark')
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-theme-'))
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('windowBackgroundFor', () => {
  it('gives each theme its neutral ground', async () => {
    const theme = await loadModule()
    expect(theme.windowBackgroundFor('light')).toBe(LIGHT_THEME.background)
    expect(theme.windowBackgroundFor('dark')).toBe(DARK_THEME.background)
  })

  it('falls back to the dark ground for an unknown theme', async () => {
    const theme = await loadModule()
    expect(theme.windowBackgroundFor('sepia')).toBe(DARK_THEME.background)
  })
})

describe('following the Windows color mode', () => {
  it('takes the dark theme from dark Windows', async () => {
    const { theme } = await startModule()
    expect(theme.getTheme()).toEqual(DARK_THEME)
  })

  it('takes the light theme from light Windows', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme } = await startModule()
    expect(theme.getTheme()).toEqual(LIGHT_THEME)
  })

  it('reports the dark theme when the nativeTheme bridge is unavailable', async () => {
    nativeTheme = undefined
    const { theme } = await startModule()
    expect(theme.getTheme()).toEqual(DARK_THEME)
  })

  it('leaves nativeTheme following Windows', async () => {
    nativeTheme = createNativeTheme('light')
    await startModule()
    expect(nativeTheme.themeSource).toBe('system')
  })

  it('broadcasts the new theme when Windows switches to light', async () => {
    const { theme, broadcasts } = await startModule()

    nativeTheme.switchWindowsTo('light')

    expect(theme.getTheme()).toEqual(LIGHT_THEME)
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: LIGHT_THEME }])
  })

  it('broadcasts nothing for a nativeTheme update that keeps the mode', async () => {
    const { broadcasts } = await startModule()

    nativeTheme.switchWindowsTo('dark')

    expect(broadcasts).toEqual([])
  })

  it('answers theme/get with the Windows theme', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme } = await startModule()
    expect(theme.handlers['theme/get']()).toEqual(LIGHT_THEME)
  })

  it('paints the window in the ground of the Windows theme', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme } = await startModule()
    expect(theme.getWindowBackground()).toBe(LIGHT_THEME.background)
  })
})

describe('the retired theme preference', () => {
  it('answers no request to set a preference', async () => {
    const theme = await loadModule()
    expect(Object.keys(theme.handlers)).toEqual(['theme/get'])
  })

  it('keeps nothing on disk', async () => {
    await startModule()

    nativeTheme.switchWindowsTo('light')

    expect(fs.readdirSync(userDataDir)).toEqual([])
  })
})

describe('the title bar overlay', () => {
  it('paints the caption buttons in the window ground with white symbols on a dark theme', async () => {
    const { theme } = await startModule()
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: DARK_THEME.background, symbolColor: '#ffffff' })
  })

  it('draws black symbols on a light theme', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme } = await startModule()
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: LIGHT_THEME.background, symbolColor: '#000000' })
  })
})

describe('listening for a theme change in the main process', () => {
  it('hears the theme Windows switches to', async () => {
    const { theme } = await startModule()
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    nativeTheme.switchWindowsTo('light')

    expect(heard).toEqual([LIGHT_THEME])
  })

  it('hears nothing when the theme did not change', async () => {
    const { theme } = await startModule()
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    nativeTheme.switchWindowsTo('dark')

    expect(heard).toEqual([])
  })

  it('stops hearing once it unsubscribes', async () => {
    const { theme } = await startModule()
    const heard = []
    const unsubscribe = theme.onThemeChange((next) => heard.push(next))
    unsubscribe()

    nativeTheme.switchWindowsTo('light')

    expect(heard).toEqual([])
  })

  it('keeps telling the other listeners when one of them throws', async () => {
    const { theme } = await startModule()
    const heard = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    theme.onThemeChange(() => {
      throw new Error('listener broke')
    })
    theme.onThemeChange((next) => heard.push(next))

    nativeTheme.switchWindowsTo('light')

    expect(heard).toEqual([LIGHT_THEME])
  })
})

describe('the synchronous boot read', () => {
  it('answers with the Windows theme', async () => {
    nativeTheme = createNativeTheme('light')
    await startModule()
    expect(readBootTheme()).toEqual(LIGHT_THEME)
  })

  it('answers with the theme Windows has moved to since start', async () => {
    const { theme } = await startModule()

    nativeTheme.switchWindowsTo('light')

    expect(readBootTheme()).toEqual(theme.getTheme())
    expect(readBootTheme()).toEqual(LIGHT_THEME)
  })
})

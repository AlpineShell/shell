import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
const { rgbToOklab, oklabToRgb } = nodeRequire('../oklab.js')
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

const DARK_BAR = { r: 30, g: 30, b: 30, darkText: false }
const LIGHT_BAR = { r: 235, g: 235, b: 235, darkText: true }

function barFromOklab(lightness, a, b, darkText) {
  const [red, green, blue] = oklabToRgb(lightness, a, b)
  return { r: red, g: green, b: blue, darkText }
}

const NAVY_BAR = barFromOklab(0.22, -0.012, -0.05, false)
const SAND_BAR = barFromOklab(0.88, 0.01, 0.04, true)

function hexOf({ r, g, b }) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function channelsOf(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
}

function chromaOf(hex) {
  const [, a, b] = rgbToOklab(...channelsOf(hex))
  return Math.hypot(a, b)
}

function createTopbarColorSource(color) {
  const listeners = []
  return {
    getEffectiveColor: () => color,
    onEffectiveColorChange: (listener) => {
      listeners.push(listener)
      return () => listeners.splice(listeners.indexOf(listener), 1)
    },
    repaintBarAs: (next) => {
      color = next
      listeners.forEach((listener) => listener(next))
    },
  }
}

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

async function startFollowing(source) {
  const started = await startModule()
  started.theme.followTopbarColor(source)
  return started
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
  it('gives each theme a neutral ground while there is no bar colour to take a hue from', async () => {
    const theme = await loadModule()
    expect(theme.windowBackgroundFor('light')).toBe(LIGHT_THEME.background)
    expect(theme.windowBackgroundFor('dark')).toBe(DARK_THEME.background)
  })

  it('falls back to the dark ground for an unknown theme', async () => {
    const theme = await loadModule()
    expect(theme.windowBackgroundFor('sepia')).toBe(DARK_THEME.background)
  })

  it('grounds the window in the colour of the bar when both are on the same side', async () => {
    const theme = await loadModule()
    expect(theme.windowBackgroundFor('dark', NAVY_BAR)).toBe(hexOf(NAVY_BAR))
    expect(theme.windowBackgroundFor('light', SAND_BAR)).toBe(hexOf(SAND_BAR))
  })

  it('carries the hue of the bar across to the other side', async () => {
    const theme = await loadModule()
    const [red, green, blue] = channelsOf(theme.windowBackgroundFor('light', NAVY_BAR))
    expect(Math.min(red, green, blue)).toBeGreaterThan(180)
    expect(blue).toBeGreaterThan(red)
  })

  it('mutes a loud bar colour rather than painting the whole window with it', async () => {
    const theme = await loadModule()
    const loudRed = { r: 255, g: 0, b: 0, darkText: false }
    expect(chromaOf(theme.windowBackgroundFor('dark', loudRed))).toBeLessThan(0.065)
  })
})

describe('before there is a bar to follow', () => {
  it('reports the dark theme on a neutral ground whatever the system shows', async () => {
    nativeTheme = createNativeTheme('light')
    const theme = await loadModule()
    expect(theme.getTheme()).toEqual(DARK_THEME)
    expect(theme.getWindowBackground()).toBe(DARK_THEME.background)
  })

  it('hands nativeTheme the dark theme when it starts', async () => {
    nativeTheme = createNativeTheme('light')
    await startModule()
    expect(nativeTheme.themeSource).toBe('dark')
  })

  it('starts and follows the bar when the nativeTheme bridge is unavailable', async () => {
    nativeTheme = undefined
    const { theme } = await startFollowing(createTopbarColorSource(LIGHT_BAR))
    expect(theme.getTheme()).toEqual(LIGHT_THEME)
  })
})

describe('following the top bar', () => {
  it('takes the dark theme from a dark top bar', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme } = await startFollowing(createTopbarColorSource(DARK_BAR))
    expect(theme.getTheme()).toEqual(DARK_THEME)
  })

  it('takes the light theme from a light top bar', async () => {
    nativeTheme = createNativeTheme('dark')
    const { theme } = await startFollowing(createTopbarColorSource(LIGHT_BAR))
    expect(theme.getTheme()).toEqual(LIGHT_THEME)
  })

  it('holds the dark theme until the top bar has a colour to read', async () => {
    nativeTheme = createNativeTheme('light')
    const { theme } = await startFollowing(createTopbarColorSource(null))
    expect(theme.getTheme()).toEqual(DARK_THEME)
  })

  it('holds the dark theme when the top bar fails to report its colour', async () => {
    const source = createTopbarColorSource(LIGHT_BAR)
    source.getEffectiveColor = () => {
      throw new Error('colour not ready')
    }
    const { theme } = await startFollowing(source)
    expect(theme.getTheme()).toEqual(DARK_THEME)
  })

  it('ignores a system theme change', async () => {
    nativeTheme = createNativeTheme('dark')
    const { theme, broadcasts } = await startFollowing(createTopbarColorSource(LIGHT_BAR))
    const broadcastsBeforeTheSwitch = broadcasts.length

    nativeTheme.switchSystemTo('light')
    nativeTheme.switchSystemTo('dark')

    expect(theme.getTheme()).toEqual(LIGHT_THEME)
    expect(broadcasts).toHaveLength(broadcastsBeforeTheSwitch)
  })

  it('follows the bar across the line between a dark and a light colour', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { theme, broadcasts } = await startFollowing(source)

    source.repaintBarAs(LIGHT_BAR)

    expect(theme.getTheme()).toEqual(LIGHT_THEME)
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: LIGHT_THEME }])
  })

  it('repaints the window when the bar changes hue without crossing the line', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { theme, broadcasts } = await startFollowing(source)

    source.repaintBarAs(NAVY_BAR)

    const repainted = { name: 'dark', background: hexOf(NAVY_BAR) }
    expect(theme.getTheme()).toEqual(repainted)
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: repainted }])
  })

  it('broadcasts nothing for a bar colour that grounds the window the same way', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { broadcasts } = await startFollowing(source)

    source.repaintBarAs({ r: 40, g: 40, b: 40, darkText: false })

    expect(broadcasts).toEqual([])
  })

  it('hands the theme the bar resolves to over to nativeTheme', async () => {
    nativeTheme = createNativeTheme('dark')
    await startFollowing(createTopbarColorSource(LIGHT_BAR))
    expect(nativeTheme.themeSource).toBe('light')
  })

  it('hands nativeTheme the new theme when the bar crosses the line', async () => {
    const source = createTopbarColorSource(LIGHT_BAR)
    await startFollowing(source)

    source.repaintBarAs(DARK_BAR)

    expect(nativeTheme.themeSource).toBe('dark')
  })

  it('colours the window with the bar', async () => {
    const { theme } = await startFollowing(createTopbarColorSource(SAND_BAR))
    expect(theme.getWindowBackground()).toBe(hexOf(SAND_BAR))
  })

  it('answers theme/get with the theme the bar resolves to', async () => {
    const { theme } = await startFollowing(createTopbarColorSource(SAND_BAR))
    expect(theme.handlers['theme/get']()).toEqual({ name: 'light', background: hexOf(SAND_BAR) })
  })
})

describe('the retired theme preference', () => {
  it('answers no request to set a preference', async () => {
    const theme = await loadModule()
    expect(Object.keys(theme.handlers)).toEqual(['theme/get'])
  })

  it('keeps nothing on disk', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    await startFollowing(source)

    source.repaintBarAs(LIGHT_BAR)

    expect(fs.readdirSync(userDataDir)).toEqual([])
  })
})

describe('the title bar overlay', () => {
  it('paints the caption buttons in the window ground with white symbols on a dark theme', async () => {
    const { theme } = await startFollowing(createTopbarColorSource(NAVY_BAR))
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: hexOf(NAVY_BAR), symbolColor: '#ffffff' })
  })

  it('draws black symbols on a light theme', async () => {
    const { theme } = await startFollowing(createTopbarColorSource(SAND_BAR))
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: hexOf(SAND_BAR), symbolColor: '#000000' })
  })
})

describe('listening for a theme change in the main process', () => {
  it('hears the theme a new bar hue resolves to', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { theme } = await startFollowing(source)
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    source.repaintBarAs(NAVY_BAR)

    expect(heard).toEqual([{ name: 'dark', background: hexOf(NAVY_BAR) }])
  })

  it('hears nothing when the theme did not change', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { theme } = await startFollowing(source)
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    source.repaintBarAs({ r: 40, g: 40, b: 40, darkText: false })

    expect(heard).toEqual([])
  })

  it('stops hearing once it unsubscribes', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { theme } = await startFollowing(source)
    const heard = []
    const unsubscribe = theme.onThemeChange((next) => heard.push(next))
    unsubscribe()

    source.repaintBarAs(LIGHT_BAR)

    expect(heard).toEqual([])
  })

  it('keeps telling the other listeners when one of them throws', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { theme } = await startFollowing(source)
    const heard = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    theme.onThemeChange(() => {
      throw new Error('listener broke')
    })
    theme.onThemeChange((next) => heard.push(next))

    source.repaintBarAs(LIGHT_BAR)

    expect(heard).toEqual([LIGHT_THEME])
  })
})

describe('the synchronous boot read', () => {
  it('answers with the theme the bar resolves to', async () => {
    nativeTheme = createNativeTheme('dark')
    await startFollowing(createTopbarColorSource(LIGHT_BAR))
    expect(readBootTheme()).toEqual(LIGHT_THEME)
  })

  it('answers with the theme the bar has moved to since start', async () => {
    const source = createTopbarColorSource(DARK_BAR)
    const { theme } = await startFollowing(source)

    source.repaintBarAs(SAND_BAR)

    expect(readBootTheme()).toEqual(theme.getTheme())
    expect(readBootTheme()).toEqual({ name: 'light', background: hexOf(SAND_BAR) })
  })
})

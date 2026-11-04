import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
const syncListeners = new Map()

let userDataDir = ''

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    app: { getPath: () => userDataDir },
    ipcMain: { on: (channel, listener) => syncListeners.set(channel, listener) },
  },
}

const DARK_THEME = { name: 'dark', background: '#1f2020' }
const LIGHT_THEME = { name: 'light', background: '#f7f7f7' }

function createColorMode(initial) {
  const listeners = []
  let mode = initial
  return {
    currentColorMode: () => mode,
    onColorModeChange: (listener) => listeners.push(listener),
    switchTo: (next) => {
      mode = next
      listeners.forEach((listener) => listener(next))
    },
  }
}

async function loadModule() {
  vi.resetModules()
  const { default: theme } = await import('./theme.js')
  return theme
}

async function startModule(initialMode = 'dark') {
  const theme = await loadModule()
  const broadcasts = []
  const colorMode = createColorMode(initialMode)
  theme.start((channel, payload) => broadcasts.push({ channel, payload }))
  theme.followColorMode(colorMode)
  return { theme, broadcasts, colorMode }
}

function readBootTheme() {
  const event = {}
  syncListeners.get('theme/init')(event)
  return event.returnValue
}

beforeEach(() => {
  syncListeners.clear()
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-theme-'))
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('themeFor', () => {
  it('reads dark mode as the dark theme on the dark ground', async () => {
    const theme = await loadModule()
    expect(theme.themeFor('dark')).toEqual(DARK_THEME)
  })

  it('reads light mode as the light theme on the light ground', async () => {
    const theme = await loadModule()
    expect(theme.themeFor('light')).toEqual(LIGHT_THEME)
  })
})

describe('following the Windows color mode', () => {
  it('starts dark before a color mode source is known', async () => {
    const theme = await loadModule()
    theme.start(() => {})
    expect(theme.getTheme()).toEqual(DARK_THEME)
  })

  it('takes the theme from the current color mode', async () => {
    const { theme } = await startModule('light')
    expect(theme.getTheme()).toEqual(LIGHT_THEME)
  })

  it('broadcasts the color mode it starts following when it differs from the default', async () => {
    const { broadcasts } = await startModule('light')
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: LIGHT_THEME }])
  })

  it('broadcasts the new theme when the color mode changes', async () => {
    const { theme, broadcasts, colorMode } = await startModule()

    colorMode.switchTo('light')

    expect(theme.getTheme()).toEqual(LIGHT_THEME)
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: LIGHT_THEME }])
  })

  it('broadcasts nothing when the color mode stays the same', async () => {
    const { broadcasts, colorMode } = await startModule()

    colorMode.switchTo('dark')

    expect(broadcasts).toEqual([])
  })

  it('answers theme/get with the color mode theme', async () => {
    const { theme } = await startModule('light')
    expect(theme.handlers['theme/get']()).toEqual(LIGHT_THEME)
  })

  it('paints the window on the ground of the color mode', async () => {
    const { theme } = await startModule('light')
    expect(theme.getWindowBackground()).toBe(LIGHT_THEME.background)
  })
})

describe('the retired theme preference', () => {
  it('answers no request to set a preference', async () => {
    const theme = await loadModule()
    expect(Object.keys(theme.handlers)).toEqual(['theme/get'])
  })

  it('keeps nothing on disk', async () => {
    const { colorMode } = await startModule()

    colorMode.switchTo('light')

    expect(fs.readdirSync(userDataDir)).toEqual([])
  })
})

describe('the title bar overlay', () => {
  it('paints the caption buttons on the dark ground with white symbols in dark mode', async () => {
    const { theme } = await startModule('dark')
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: DARK_THEME.background, symbolColor: '#ffffff' })
  })

  it('draws black symbols on the light ground in light mode', async () => {
    const { theme } = await startModule('light')
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: LIGHT_THEME.background, symbolColor: '#000000' })
  })
})

describe('listening for a theme change in the main process', () => {
  it('hears the theme the color mode moves to', async () => {
    const { theme, colorMode } = await startModule()
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    colorMode.switchTo('light')

    expect(heard).toEqual([LIGHT_THEME])
  })

  it('hears nothing when the theme did not change', async () => {
    const { theme, colorMode } = await startModule()
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    colorMode.switchTo('dark')

    expect(heard).toEqual([])
  })

  it('stops hearing once it unsubscribes', async () => {
    const { theme, colorMode } = await startModule()
    const heard = []
    const unsubscribe = theme.onThemeChange((next) => heard.push(next))
    unsubscribe()

    colorMode.switchTo('light')

    expect(heard).toEqual([])
  })

  it('keeps telling the other listeners when one of them throws', async () => {
    const { theme, colorMode } = await startModule()
    const heard = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    theme.onThemeChange(() => {
      throw new Error('listener broke')
    })
    theme.onThemeChange((next) => heard.push(next))

    colorMode.switchTo('light')

    expect(heard).toEqual([LIGHT_THEME])
  })
})

describe('the synchronous boot read', () => {
  it('answers with the color mode theme', async () => {
    await startModule('light')
    expect(readBootTheme()).toEqual(LIGHT_THEME)
  })

  it('answers with the theme the color mode has moved to since start', async () => {
    const { theme, colorMode } = await startModule()

    colorMode.switchTo('light')

    expect(readBootTheme()).toEqual(theme.getTheme())
    expect(readBootTheme()).toEqual(LIGHT_THEME)
  })
})

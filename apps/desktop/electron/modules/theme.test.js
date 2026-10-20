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

const GRAPHITE = { r: 32, g: 32, b: 32, darkText: false }
const SLATE = { r: 35, g: 40, b: 48, darkText: false }
const PAPER = { r: 232, g: 232, b: 229, darkText: true }
const GRAPHITE_THEME = { name: 'dark', background: '#202020' }
const SLATE_THEME = { name: 'dark', background: '#232830' }
const PAPER_THEME = { name: 'light', background: '#e8e8e5' }

function createRidgeColor(initial) {
  const listeners = []
  let color = initial
  return {
    currentColor: () => color,
    onColorChange: (listener) => listeners.push(listener),
    paint: (next) => {
      color = next
      listeners.forEach((listener) => listener())
    },
  }
}

async function loadModule() {
  vi.resetModules()
  const { default: theme } = await import('./theme.js')
  return theme
}

async function startModule(initialColor = GRAPHITE) {
  const theme = await loadModule()
  const broadcasts = []
  const ridge = createRidgeColor(initialColor)
  theme.start((channel, payload) => broadcasts.push({ channel, payload }))
  theme.followRidgeColor(ridge)
  return { theme, broadcasts, ridge }
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
  it('reads a dark Ridge as the dark theme on that color', async () => {
    const theme = await loadModule()
    expect(theme.themeFor(SLATE)).toEqual(SLATE_THEME)
  })

  it('reads a Ridge with dark text as the light theme on that color', async () => {
    const theme = await loadModule()
    expect(theme.themeFor(PAPER)).toEqual(PAPER_THEME)
  })

  it('clamps and rounds channels into a hex color', async () => {
    const theme = await loadModule()
    expect(theme.themeFor({ r: 300, g: -4, b: 127.6, darkText: false }).background).toBe('#ff0080')
  })
})

describe('following the Ridge color', () => {
  it('starts in the default Ridge color before a color source is known', async () => {
    const theme = await loadModule()
    theme.start(() => {})
    expect(theme.getTheme()).toEqual(GRAPHITE_THEME)
  })

  it('falls back to the default Ridge color while the source has no color yet', async () => {
    const { theme } = await startModule(null)
    expect(theme.getTheme()).toEqual(GRAPHITE_THEME)
  })

  it('takes the theme from the current Ridge color', async () => {
    const { theme } = await startModule(PAPER)
    expect(theme.getTheme()).toEqual(PAPER_THEME)
  })

  it('broadcasts the Ridge color it starts following when it differs from the default', async () => {
    const { broadcasts } = await startModule(SLATE)
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: SLATE_THEME }])
  })

  it('broadcasts the new theme when the Ridge color changes', async () => {
    const { theme, broadcasts, ridge } = await startModule()

    ridge.paint(PAPER)

    expect(theme.getTheme()).toEqual(PAPER_THEME)
    expect(broadcasts).toEqual([{ channel: 'theme/changed', payload: PAPER_THEME }])
  })

  it('broadcasts nothing when the Ridge keeps its color', async () => {
    const { broadcasts, ridge } = await startModule()

    ridge.paint({ ...GRAPHITE })

    expect(broadcasts).toEqual([])
  })

  it('answers theme/get with the Ridge theme', async () => {
    const { theme } = await startModule(SLATE)
    expect(theme.handlers['theme/get']()).toEqual(SLATE_THEME)
  })

  it('paints the window in the Ridge color', async () => {
    const { theme } = await startModule(SLATE)
    expect(theme.getWindowBackground()).toBe(SLATE_THEME.background)
  })
})

describe('the retired theme preference', () => {
  it('answers no request to set a preference', async () => {
    const theme = await loadModule()
    expect(Object.keys(theme.handlers)).toEqual(['theme/get'])
  })

  it('keeps nothing on disk', async () => {
    const { ridge } = await startModule()

    ridge.paint(PAPER)

    expect(fs.readdirSync(userDataDir)).toEqual([])
  })
})

describe('the title bar overlay', () => {
  it('paints the caption buttons in the Ridge color with white symbols on a dark Ridge', async () => {
    const { theme } = await startModule(SLATE)
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: SLATE_THEME.background, symbolColor: '#ffffff' })
  })

  it('draws black symbols on a light Ridge', async () => {
    const { theme } = await startModule(PAPER)
    expect(theme.getTitleBarOverlayColors()).toEqual({ color: PAPER_THEME.background, symbolColor: '#000000' })
  })
})

describe('listening for a theme change in the main process', () => {
  it('hears the theme the Ridge color moves to', async () => {
    const { theme, ridge } = await startModule()
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    ridge.paint(PAPER)

    expect(heard).toEqual([PAPER_THEME])
  })

  it('hears nothing when the theme did not change', async () => {
    const { theme, ridge } = await startModule()
    const heard = []
    theme.onThemeChange((next) => heard.push(next))

    ridge.paint({ ...GRAPHITE })

    expect(heard).toEqual([])
  })

  it('stops hearing once it unsubscribes', async () => {
    const { theme, ridge } = await startModule()
    const heard = []
    const unsubscribe = theme.onThemeChange((next) => heard.push(next))
    unsubscribe()

    ridge.paint(PAPER)

    expect(heard).toEqual([])
  })

  it('keeps telling the other listeners when one of them throws', async () => {
    const { theme, ridge } = await startModule()
    const heard = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    theme.onThemeChange(() => {
      throw new Error('listener broke')
    })
    theme.onThemeChange((next) => heard.push(next))

    ridge.paint(PAPER)

    expect(heard).toEqual([PAPER_THEME])
  })
})

describe('the synchronous boot read', () => {
  it('answers with the Ridge theme', async () => {
    await startModule(PAPER)
    expect(readBootTheme()).toEqual(PAPER_THEME)
  })

  it('answers with the theme the Ridge color has moved to since start', async () => {
    const { theme, ridge } = await startModule()

    ridge.paint(SLATE)

    expect(readBootTheme()).toEqual(theme.getTheme())
    expect(readBootTheme()).toEqual(SLATE_THEME)
  })
})

import { describe, expect, it, beforeEach } from 'vitest'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
let openWindows = []

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    BrowserWindow: { getAllWindows: () => openWindows },
    ipcMain: { handle: () => {} },
  },
}

const { broadcast, broadcastToTopbars, parsePageMode, pageModeHearsChannel } = nodeRequire('./ipc.js')

const PACKAGED_PAGE = 'file:///opt/alpine-shell/resources/app.asar/dist/index.html'
const DEV_PAGE = 'http://localhost:5173/'

function fakeWindow(url, { destroyed = false } = {}) {
  const received = []
  return {
    received,
    isDestroyed: () => destroyed,
    webContents: {
      isDestroyed: () => destroyed,
      getURL: () => url,
      send: (channel, data) => received.push({ channel, data }),
    },
  }
}

function receivedChannels(win) {
  return win.received.map((message) => message.channel)
}

describe('page mode of a window url', () => {
  it('reads the mode of the packaged and the dev server page', () => {
    expect(parsePageMode(`${PACKAGED_PAGE}?mode=topbar&displayId=7`)).toBe('topbar')
    expect(parsePageMode(`${DEV_PAGE}?mode=screenshot`)).toBe('screenshot')
  })

  it('knows no mode for a plugin page, an empty url or garbage', () => {
    expect(parsePageMode('alpine-plugin://com.example.plugin/window.html?mode=desktop')).toBeNull()
    expect(parsePageMode('')).toBeNull()
    expect(parsePageMode('not a url')).toBeNull()
  })
})

describe('which page modes hear a broadcast channel', () => {
  it('lets the desktop hear only its wallpaper and the theme', () => {
    expect(pageModeHearsChannel('desktop', 'windows/wallpaper-changed')).toBe(true)
    expect(pageModeHearsChannel('desktop', 'theme/changed')).toBe(true)
    expect(pageModeHearsChannel('desktop', 'tray/icons-changed')).toBe(false)
    expect(pageModeHearsChannel('desktop', 'clipboard/history-changed')).toBe(false)
  })

  it('lets the screenshot overlay and the identify badge hear only the theme', () => {
    for (const mode of ['screenshot', 'identify']) {
      expect(pageModeHearsChannel(mode, 'theme/changed')).toBe(true)
      expect(pageModeHearsChannel(mode, 'media/session-changed')).toBe(false)
      expect(pageModeHearsChannel(mode, 'windows/wallpaper-changed')).toBe(false)
    }
  })

  it('lets every other page hear everything', () => {
    for (const mode of ['topbar', 'settings', 'setup', null, 'constructor', 'unknown']) {
      expect(pageModeHearsChannel(mode, 'tray/icons-changed')).toBe(true)
      expect(pageModeHearsChannel(mode, 'clipboard/history-changed')).toBe(true)
    }
  })
})

describe('broadcast', () => {
  let topbar, desktop, screenshot, settings, setup, plugin, loading, closed

  beforeEach(() => {
    topbar = fakeWindow(`${PACKAGED_PAGE}?mode=topbar&displayId=1`)
    desktop = fakeWindow(`${PACKAGED_PAGE}?mode=desktop`)
    screenshot = fakeWindow(`${PACKAGED_PAGE}?mode=screenshot`)
    settings = fakeWindow(`${PACKAGED_PAGE}?mode=settings`)
    setup = fakeWindow(`${DEV_PAGE}?mode=setup`)
    plugin = fakeWindow('alpine-plugin://com.example.plugin/window.html')
    loading = fakeWindow('')
    closed = fakeWindow(`${PACKAGED_PAGE}?mode=topbar&displayId=2`, { destroyed: true })
    openWindows = [topbar, desktop, screenshot, settings, setup, plugin, loading, closed]
  })

  it('sends a channel only to the pages that can listen to it', () => {
    broadcast('tray/icons-changed', [{ id: 1 }])
    expect(receivedChannels(topbar)).toEqual(['tray/icons-changed'])
    expect(receivedChannels(settings)).toEqual(['tray/icons-changed'])
    expect(receivedChannels(setup)).toEqual(['tray/icons-changed'])
    expect(receivedChannels(plugin)).toEqual(['tray/icons-changed'])
    expect(receivedChannels(loading)).toEqual(['tray/icons-changed'])
    expect(receivedChannels(desktop)).toEqual([])
    expect(receivedChannels(screenshot)).toEqual([])
    expect(receivedChannels(closed)).toEqual([])
  })

  it('still sends the wallpaper to the desktop and the theme to every page', () => {
    broadcast('windows/wallpaper-changed', 'file:///wallpaper.jpg')
    broadcast('theme/changed', { name: 'light' })
    expect(receivedChannels(desktop)).toEqual(['windows/wallpaper-changed', 'theme/changed'])
    expect(receivedChannels(screenshot)).toEqual(['theme/changed'])
    expect(topbar.received[0]).toEqual({ channel: 'windows/wallpaper-changed', data: 'file:///wallpaper.jpg' })
  })

  it('follows a window to the page it navigated to', () => {
    let url = `${PACKAGED_PAGE}?mode=desktop`
    const navigating = fakeWindow(url)
    navigating.webContents.getURL = () => url
    openWindows = [navigating]
    broadcast('tray/icons-changed', [])
    url = `${PACKAGED_PAGE}?mode=topbar&displayId=3`
    broadcast('tray/icons-changed', [])
    expect(receivedChannels(navigating)).toEqual(['tray/icons-changed'])
  })

  it('sends topbar channels to topbars only', () => {
    broadcastToTopbars('system/audio-peak', 0.5)
    expect(topbar.received).toEqual([{ channel: 'system/audio-peak', data: 0.5 }])
    for (const win of [desktop, screenshot, settings, setup, plugin, loading, closed]) {
      expect(win.received).toEqual([])
    }
  })
})

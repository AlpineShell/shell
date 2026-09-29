import { describe, expect, it } from 'vitest'
import path from 'path'
import { pathToFileURL } from 'url'

const { isAppPageUrl, pluginIdOfPageUrl, mayNavigate, isBrowserLink, acceptsIpcSender } = await import('./pageUrls.js')

const INSTALL_DIR = path.resolve(path.join(path.sep, 'Programs', 'Alpine Shell', 'resources', 'app.asar'))
const INDEX_PATH = path.join(INSTALL_DIR, 'dist', 'index.html')
const INDEX_URL = pathToFileURL(INDEX_PATH).href
const PACKAGED = { indexPath: INDEX_PATH, devServerUrl: null }
const DEVELOPMENT = { indexPath: null, devServerUrl: 'http://127.0.0.1:5173' }

function fileUrl(...segments) {
  return pathToFileURL(path.join(INSTALL_DIR, ...segments)).href
}

describe('isAppPageUrl', () => {
  it('accepts the packaged index page in every mode', () => {
    expect(isAppPageUrl(`${INDEX_URL}?mode=topbar&displayId=2`, PACKAGED)).toBe(true)
    expect(isAppPageUrl(`${INDEX_URL}?mode=settings`, PACKAGED)).toBe(true)
    expect(isAppPageUrl(INDEX_URL, PACKAGED)).toBe(true)
  })

  it('refuses any other file on the machine, even next to the index page', () => {
    expect(isAppPageUrl(fileUrl('dist', 'other.html'), PACKAGED)).toBe(false)
    expect(isAppPageUrl(fileUrl('index.html'), PACKAGED)).toBe(false)
    expect(isAppPageUrl(pathToFileURL(path.resolve(path.join(path.sep, 'Users', 'someone', 'Downloads', 'index.html'))).href, PACKAGED)).toBe(false)
  })

  it('refuses the dev server in a packaged build and the index file in development', () => {
    expect(isAppPageUrl('http://127.0.0.1:5173/?mode=topbar', PACKAGED)).toBe(false)
    expect(isAppPageUrl(`${INDEX_URL}?mode=topbar`, DEVELOPMENT)).toBe(false)
  })

  it('accepts only the exact dev server origin in development', () => {
    expect(isAppPageUrl('http://127.0.0.1:5173/?mode=topbar', DEVELOPMENT)).toBe(true)
    expect(isAppPageUrl('http://127.0.0.1:5173/src/main.tsx', DEVELOPMENT)).toBe(true)
    expect(isAppPageUrl('http://localhost:5173/?mode=topbar', DEVELOPMENT)).toBe(false)
    expect(isAppPageUrl('http://127.0.0.1:5174/?mode=topbar', DEVELOPMENT)).toBe(false)
    expect(isAppPageUrl('https://127.0.0.1:5173/?mode=topbar', DEVELOPMENT)).toBe(false)
  })

  it('refuses web pages, plugin pages and anything unparseable', () => {
    expect(isAppPageUrl('https://www.openstreetmap.org/', PACKAGED)).toBe(false)
    expect(isAppPageUrl('alpine-plugin://com.alpine.android/window/page.html', PACKAGED)).toBe(false)
    expect(isAppPageUrl('about:blank', PACKAGED)).toBe(false)
    expect(isAppPageUrl('', PACKAGED)).toBe(false)
    expect(isAppPageUrl(undefined, PACKAGED)).toBe(false)
    expect(isAppPageUrl('not a url', PACKAGED)).toBe(false)
  })

  it('refuses everything until the app location is known', () => {
    expect(isAppPageUrl(INDEX_URL, null)).toBe(false)
    expect(isAppPageUrl(INDEX_URL, { indexPath: null, devServerUrl: null })).toBe(false)
    expect(isAppPageUrl('file:///anything', { indexPath: null, devServerUrl: 'file:///anything' })).toBe(false)
  })
})

describe('pluginIdOfPageUrl', () => {
  it('reads the plugin id from a plugin page', () => {
    expect(pluginIdOfPageUrl('alpine-plugin://com.alpine.android/window/page.html')).toBe('com.alpine.android')
  })

  it('returns null for anything that is not a plugin page', () => {
    expect(pluginIdOfPageUrl(INDEX_URL)).toBeNull()
    expect(pluginIdOfPageUrl('https://com.alpine.android/window/page.html')).toBeNull()
    expect(pluginIdOfPageUrl('alpine-plugin:page.html')).toBeNull()
    expect(pluginIdOfPageUrl('')).toBeNull()
  })
})

describe('mayNavigate', () => {
  it('keeps a shell window on the shell page', () => {
    expect(mayNavigate(`${INDEX_URL}?mode=topbar`, `${INDEX_URL}?mode=topbar`, PACKAGED)).toBe(true)
    expect(mayNavigate(`${INDEX_URL}?mode=settings`, 'https://evil.example/', PACKAGED)).toBe(false)
    expect(mayNavigate(`${INDEX_URL}?mode=settings`, fileUrl('dist', 'other.html'), PACKAGED)).toBe(false)
    expect(mayNavigate(`${INDEX_URL}?mode=settings`, 'alpine-plugin://com.alpine.android/window/page.html', PACKAGED)).toBe(false)
  })

  it('keeps a plugin window inside its own plugin', () => {
    const page = 'alpine-plugin://com.alpine.android/window/page.html'
    expect(mayNavigate(page, 'alpine-plugin://com.alpine.android/window/other.html', PACKAGED)).toBe(true)
    expect(mayNavigate(page, 'alpine-plugin://com.other.plugin/window/page.html', PACKAGED)).toBe(false)
    expect(mayNavigate(page, `${INDEX_URL}?mode=settings`, PACKAGED)).toBe(false)
    expect(mayNavigate(page, 'https://evil.example/', PACKAGED)).toBe(false)
  })

  it('lets nothing else navigate', () => {
    expect(mayNavigate('https://www.openstreetmap.org/', 'https://evil.example/', PACKAGED)).toBe(false)
    expect(mayNavigate('https://www.openstreetmap.org/', `${INDEX_URL}?mode=settings`, PACKAGED)).toBe(false)
    expect(mayNavigate('', `${INDEX_URL}?mode=settings`, PACKAGED)).toBe(false)
  })
})

describe('isBrowserLink', () => {
  it('sends https pages to the browser', () => {
    expect(isBrowserLink('https://www.openstreetmap.org/?mlat=47.3&mlon=8.5#map=16/47.3/8.5')).toBe(true)
  })

  it('never hands other schemes to the operating system', () => {
    expect(isBrowserLink('http://example.com/')).toBe(false)
    expect(isBrowserLink('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isBrowserLink('file://attacker/share/payload.exe')).toBe(false)
    expect(isBrowserLink('search-ms:query=x&crumb=location:\\\\attacker\\share')).toBe(false)
    expect(isBrowserLink('ms-msdt:/id PCWDiagnostic')).toBe(false)
    expect(isBrowserLink('javascript:alert(1)')).toBe(false)
    expect(isBrowserLink('alpine-shell://install-plugin?id=x')).toBe(false)
    expect(isBrowserLink('https:')).toBe(false)
    expect(isBrowserLink('')).toBe(false)
    expect(isBrowserLink(null)).toBe(false)
  })
})

describe('acceptsIpcSender', () => {
  it('takes shell channels from the shell page only', () => {
    expect(acceptsIpcSender('run/exec', `${INDEX_URL}?mode=topbar`, PACKAGED)).toBe(true)
    expect(acceptsIpcSender('run/exec', 'http://127.0.0.1:5173/?mode=topbar', DEVELOPMENT)).toBe(true)
    expect(acceptsIpcSender('run/exec', 'https://www.openstreetmap.org/', PACKAGED)).toBe(false)
    expect(acceptsIpcSender('run/exec', 'alpine-plugin://com.alpine.android/window/page.html', PACKAGED)).toBe(false)
    expect(acceptsIpcSender('setup/install', fileUrl('dist', 'other.html'), PACKAGED)).toBe(false)
    expect(acceptsIpcSender('run/exec', '', PACKAGED)).toBe(false)
  })

  it('takes plugin window channels from plugin pages only', () => {
    const android = { pluginId: 'com.alpine.android', windowId: 'main' }
    expect(acceptsIpcSender('plugin-window/command', 'alpine-plugin://com.alpine.android/window/page.html', PACKAGED, android)).toBe(true)
    expect(acceptsIpcSender('plugin-window/close', 'alpine-plugin://com.alpine.android/window/page.html', PACKAGED, android)).toBe(true)
    expect(acceptsIpcSender('plugin-window/command', `${INDEX_URL}?mode=topbar`, PACKAGED, android)).toBe(false)
    expect(acceptsIpcSender('plugin-window/command', 'https://evil.example/', PACKAGED, android)).toBe(false)
    expect(acceptsIpcSender('plugin-window/command', '', PACKAGED, android)).toBe(false)
  })

  it('lets a plugin window speak only for its own plugin', () => {
    const page = 'alpine-plugin://com.alpine.android/window/page.html'
    expect(acceptsIpcSender('plugin-window/command', page, PACKAGED, { pluginId: 'com.alpine.ubuntu', windowId: 'main' })).toBe(false)
    expect(acceptsIpcSender('plugin-window/close', page, PACKAGED, { pluginId: 'com.alpine.ubuntu', windowId: 'main' })).toBe(false)
    expect(acceptsIpcSender('plugin-window/command', page, PACKAGED, { windowId: 'main' })).toBe(false)
    expect(acceptsIpcSender('plugin-window/command', page, PACKAGED, null)).toBe(false)
    expect(acceptsIpcSender('plugin-window/command', page, PACKAGED)).toBe(false)
    expect(acceptsIpcSender('plugin-window/command', page, PACKAGED, { pluginId: 'Com.Alpine.Android', windowId: 'main' })).toBe(true)
  })
})

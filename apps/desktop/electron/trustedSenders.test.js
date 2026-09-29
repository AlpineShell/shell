import { afterEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import { pathToFileURL } from 'url'

const { setTrustedWindowsAccessor, setAppLocation, isTrustedSender, isShellSender, guardHandlers, guardShellSender, UNTRUSTED_SENDER, SETUP_WINDOW, SETTINGS_WINDOW } = await import('./trustedSenders.js')

const INDEX_PATH = path.resolve(path.join(path.sep, 'Programs', 'Alpine Shell', 'resources', 'app.asar', 'dist', 'index.html'))
const INDEX_URL = pathToFileURL(INDEX_PATH).href
const PLUGIN_PAGE_URL = 'alpine-plugin://com.alpine.android/window/page.html'
const BOTH_WINDOWS = [SETUP_WINDOW, SETTINGS_WINDOW]

function fakeWindow(id, { destroyed = false } = {}) {
  const webContents = { id, mainFrame: { id: `frame-${id}` } }
  return { webContents, isDestroyed: () => destroyed }
}

function eventFrom(win, { frame } = {}) {
  const sender = win.webContents
  return { sender, senderFrame: frame === undefined ? sender.mainFrame : frame }
}

function eventFromPage(url) {
  return { sender: { id: 1 }, senderFrame: { url } }
}

afterEach(() => {
  setTrustedWindowsAccessor(null)
  setAppLocation(null)
  vi.restoreAllMocks()
})

describe('trusted senders', () => {
  it('refuses every sender until main registers the windows it trusts', () => {
    expect(isTrustedSender(eventFrom(fakeWindow(1)), BOTH_WINDOWS)).toBe(false)
  })

  it('accepts the setup and settings windows and nothing else', () => {
    const setupWin = fakeWindow(1)
    const settingsWin = fakeWindow(2)
    const topbar = fakeWindow(3)
    setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: setupWin, [SETTINGS_WINDOW]: settingsWin }))
    expect(isTrustedSender(eventFrom(setupWin), BOTH_WINDOWS)).toBe(true)
    expect(isTrustedSender(eventFrom(settingsWin), BOTH_WINDOWS)).toBe(true)
    expect(isTrustedSender(eventFrom(topbar), BOTH_WINDOWS)).toBe(false)
  })

  it('accepts only the windows a handler names', () => {
    const setupWin = fakeWindow(1)
    const settingsWin = fakeWindow(2)
    setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: setupWin, [SETTINGS_WINDOW]: settingsWin }))
    expect(isTrustedSender(eventFrom(setupWin), [SETUP_WINDOW])).toBe(true)
    expect(isTrustedSender(eventFrom(settingsWin), [SETUP_WINDOW])).toBe(false)
    expect(isTrustedSender(eventFrom(settingsWin), [SETTINGS_WINDOW])).toBe(true)
    expect(isTrustedSender(eventFrom(setupWin), [SETTINGS_WINDOW])).toBe(false)
  })

  it('refuses every sender when a handler names no windows', () => {
    const setupWin = fakeWindow(1)
    setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: setupWin }))
    expect(isTrustedSender(eventFrom(setupWin))).toBe(false)
    expect(isTrustedSender(eventFrom(setupWin), [])).toBe(false)
  })

  it('ignores a window that has been destroyed or is missing', () => {
    const gone = fakeWindow(1, { destroyed: true })
    setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: gone, [SETTINGS_WINDOW]: null }))
    expect(isTrustedSender(eventFrom(gone), BOTH_WINDOWS)).toBe(false)
  })

  it('refuses a frame that is not the top frame of a trusted window', () => {
    const settingsWin = fakeWindow(2)
    setTrustedWindowsAccessor(() => ({ [SETTINGS_WINDOW]: settingsWin }))
    expect(isTrustedSender(eventFrom(settingsWin, { frame: { id: 'iframe' } }), BOTH_WINDOWS)).toBe(false)
    expect(isTrustedSender(eventFrom(settingsWin, { frame: null }), BOTH_WINDOWS)).toBe(false)
  })

  it('refuses an event without a sender', () => {
    setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: fakeWindow(1) }))
    expect(isTrustedSender({}, BOTH_WINDOWS)).toBe(false)
    expect(isTrustedSender(null, BOTH_WINDOWS)).toBe(false)
  })

  it('wraps handlers so an untrusted sender is refused before the handler runs', () => {
    const setupWin = fakeWindow(1)
    const settingsWin = fakeWindow(2)
    const other = fakeWindow(9)
    setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: setupWin, [SETTINGS_WINDOW]: settingsWin }))
    const run = vi.fn(() => 'done')
    const guarded = guardHandlers({ 'setup/install': run }, [SETUP_WINDOW])
    expect(() => guarded['setup/install'](eventFrom(other), { shell: true })).toThrow(UNTRUSTED_SENDER)
    expect(() => guarded['setup/install'](eventFrom(settingsWin), { shell: true })).toThrow(UNTRUSTED_SENDER)
    expect(run).not.toHaveBeenCalled()
    expect(guarded['setup/install'](eventFrom(setupWin), { shell: true })).toBe('done')
    expect(run).toHaveBeenCalledWith(expect.anything(), { shell: true })
  })
})

describe('shell senders', () => {
  it('refuses every sender until main says where the shell page lives', () => {
    expect(isShellSender('run/exec', eventFromPage(`${INDEX_URL}?mode=topbar`))).toBe(false)
  })

  it('accepts the shell page and refuses a page the window was navigated to', () => {
    setAppLocation({ indexPath: INDEX_PATH, devServerUrl: null })
    expect(isShellSender('run/exec', eventFromPage(`${INDEX_URL}?mode=topbar`))).toBe(true)
    expect(isShellSender('run/exec', eventFromPage('https://evil.example/'))).toBe(false)
    expect(isShellSender('run/exec', eventFromPage(PLUGIN_PAGE_URL))).toBe(false)
  })

  it('keeps plugin windows to their own channels and their own plugin', () => {
    setAppLocation({ indexPath: INDEX_PATH, devServerUrl: null })
    const request = { pluginId: 'com.alpine.android', windowId: 'main', name: 'tap' }
    expect(isShellSender('plugin-window/command', eventFromPage(PLUGIN_PAGE_URL), request)).toBe(true)
    expect(isShellSender('plugin-window/command', eventFromPage(`${INDEX_URL}?mode=topbar`), request)).toBe(false)
    expect(isShellSender('plugin-window/command', eventFromPage(PLUGIN_PAGE_URL), { ...request, pluginId: 'com.alpine.ubuntu' })).toBe(false)
  })

  it('checks a plugin window call against the plugin it names', () => {
    setAppLocation({ indexPath: INDEX_PATH, devServerUrl: null })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const command = vi.fn(() => ({ ok: true }))
    const guarded = guardShellSender('plugin-window/command', command)
    expect(() => guarded(eventFromPage(PLUGIN_PAGE_URL), { pluginId: 'com.alpine.ubuntu', windowId: 'main', name: 'install' })).toThrow(UNTRUSTED_SENDER)
    expect(command).not.toHaveBeenCalled()
    expect(guarded(eventFromPage(PLUGIN_PAGE_URL), { pluginId: 'com.alpine.android', windowId: 'main', name: 'tap' })).toEqual({ ok: true })
  })

  it('refuses a frame that is gone or cannot be read', () => {
    setAppLocation({ indexPath: INDEX_PATH, devServerUrl: null })
    const disposed = { sender: { id: 1 }, get senderFrame() { throw new Error('Render frame was disposed') } }
    expect(isShellSender('run/exec', { sender: { id: 1 }, senderFrame: null })).toBe(false)
    expect(isShellSender('run/exec', disposed)).toBe(false)
    expect(isShellSender('run/exec', null)).toBe(false)
  })

  it('wraps a handler so a foreign page is refused before it runs', () => {
    setAppLocation({ indexPath: null, devServerUrl: 'http://127.0.0.1:5173' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const run = vi.fn(() => ({ ok: true }))
    const guarded = guardShellSender('run/exec', run)
    expect(() => guarded(eventFromPage('https://evil.example/'), 'calc.exe')).toThrow(UNTRUSTED_SENDER)
    expect(run).not.toHaveBeenCalled()
    expect(guarded(eventFromPage('http://127.0.0.1:5173/?mode=topbar'), 'calc.exe')).toEqual({ ok: true })
    expect(run).toHaveBeenCalledWith(expect.anything(), 'calc.exe')
  })
})

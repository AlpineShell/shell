import { afterEach, describe, expect, it, vi } from 'vitest'

const { setTrustedWindowsAccessor, isTrustedSender, guardHandlers, UNTRUSTED_SENDER, SETUP_WINDOW, SETTINGS_WINDOW } = await import('./trustedSenders.js')

const BOTH_WINDOWS = [SETUP_WINDOW, SETTINGS_WINDOW]

function fakeWindow(id, { destroyed = false } = {}) {
  const webContents = { id, mainFrame: { id: `frame-${id}` } }
  return { webContents, isDestroyed: () => destroyed }
}

function eventFrom(win, { frame } = {}) {
  const sender = win.webContents
  return { sender, senderFrame: frame === undefined ? sender.mainFrame : frame }
}

afterEach(() => {
  setTrustedWindowsAccessor(null)
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

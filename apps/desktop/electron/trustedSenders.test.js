import { afterEach, describe, expect, it, vi } from 'vitest'

const { setTrustedWindowsAccessor, isTrustedSender, guardHandlers, UNTRUSTED_SENDER } = await import('./trustedSenders.js')

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
    expect(isTrustedSender(eventFrom(fakeWindow(1)))).toBe(false)
  })

  it('accepts the setup and settings windows and nothing else', () => {
    const setupWin = fakeWindow(1)
    const settingsWin = fakeWindow(2)
    const topbar = fakeWindow(3)
    setTrustedWindowsAccessor(() => [setupWin, settingsWin])
    expect(isTrustedSender(eventFrom(setupWin))).toBe(true)
    expect(isTrustedSender(eventFrom(settingsWin))).toBe(true)
    expect(isTrustedSender(eventFrom(topbar))).toBe(false)
  })

  it('ignores a window that has been destroyed or is missing', () => {
    const gone = fakeWindow(1, { destroyed: true })
    setTrustedWindowsAccessor(() => [gone, null, undefined])
    expect(isTrustedSender(eventFrom(gone))).toBe(false)
  })

  it('refuses a frame that is not the top frame of a trusted window', () => {
    const settingsWin = fakeWindow(2)
    setTrustedWindowsAccessor(() => [settingsWin])
    expect(isTrustedSender(eventFrom(settingsWin, { frame: { id: 'iframe' } }))).toBe(false)
    expect(isTrustedSender(eventFrom(settingsWin, { frame: null }))).toBe(false)
  })

  it('refuses an event without a sender', () => {
    setTrustedWindowsAccessor(() => [fakeWindow(1)])
    expect(isTrustedSender({})).toBe(false)
    expect(isTrustedSender(null)).toBe(false)
  })

  it('wraps handlers so an untrusted sender is refused before the handler runs', () => {
    const settingsWin = fakeWindow(2)
    const other = fakeWindow(9)
    setTrustedWindowsAccessor(() => [settingsWin])
    const run = vi.fn(() => 'done')
    const guarded = guardHandlers({ 'setup/install': run })
    expect(() => guarded['setup/install'](eventFrom(other), { shell: true })).toThrow(UNTRUSTED_SENDER)
    expect(run).not.toHaveBeenCalled()
    expect(guarded['setup/install'](eventFrom(settingsWin), { shell: true })).toBe('done')
    expect(run).toHaveBeenCalledWith(expect.anything(), { shell: true })
  })

  it('leaves the excepted channels open to any window while guarding the rest', () => {
    const desktopWin = fakeWindow(4)
    setTrustedWindowsAccessor(() => [fakeWindow(1)])
    const online = vi.fn(() => 'evaluated')
    const status = vi.fn(() => 'status')
    const guarded = guardHandlers({ 'licence/online': online, 'licence/status': status }, { except: ['licence/online'] })
    expect(guarded['licence/online'](eventFrom(desktopWin))).toBe('evaluated')
    expect(() => guarded['licence/status'](eventFrom(desktopWin))).toThrow(UNTRUSTED_SENDER)
    expect(status).not.toHaveBeenCalled()
  })
})

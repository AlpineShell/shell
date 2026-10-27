import { describe, it, expect, vi, afterEach } from 'vitest'
import browserTabsNative from './browserTabsNative.js'

const { NATIVE_ADDON_PATH, bindBrowserTabs, loadNativeBrowserTabs } = browserTabsNative

const CHROME_WINDOW = 263166

function chromeRows() {
  return [
    { hwnd: CHROME_WINDOW, browser: 'chrome', index: 0, selected: false, title: 'Inbox - Memory usage - 88.3 MB' },
    { hwnd: CHROME_WINDOW, browser: 'chrome', index: 1, selected: true, title: 'Tasks' },
    { hwnd: CHROME_WINDOW, browser: 'chrome', index: 2, selected: false, title: ' - Audio playing' },
  ]
}

function fakeAddon() {
  return {
    browserTabsList: vi.fn(async () => chromeRows()),
    browserTabsActivate: vi.fn(async () => 'ok'),
    browserTabsWarm: vi.fn(async () => {}),
  }
}

function neverSettles() {
  return new Promise(() => {})
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('bindBrowserTabs', () => {
  it('lists tabs with cleaned titles and drops rows left without a title', async () => {
    const tabs = await bindBrowserTabs(fakeAddon()).listTabs()
    expect(tabs).toEqual([
      { hwnd: CHROME_WINDOW, browser: 'chrome', index: 0, selected: false, title: 'Inbox' },
      { hwnd: CHROME_WINDOW, browser: 'chrome', index: 1, selected: true, title: 'Tasks' },
    ])
  })

  it('gives every caller its own list while one listing is in flight', async () => {
    const addon = fakeAddon()
    const browserTabs = bindBrowserTabs(addon)
    const [first, second] = await Promise.all([browserTabs.listTabs(), browserTabs.listTabs()])
    expect(addon.browserTabsList).toHaveBeenCalledOnce()
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
  })

  it('lists again once the previous listing settled', async () => {
    const addon = fakeAddon()
    const browserTabs = bindBrowserTabs(addon)
    await browserTabs.listTabs()
    await browserTabs.listTabs()
    expect(addon.browserTabsList).toHaveBeenCalledTimes(2)
  })

  it('selects a tab and reports whether the add-on selected it', async () => {
    const addon = fakeAddon()
    const browserTabs = bindBrowserTabs(addon)
    expect(await browserTabs.activateTab(CHROME_WINDOW, 1, 'Tasks')).toBe(true)
    expect(addon.browserTabsActivate).toHaveBeenCalledWith(CHROME_WINDOW, 1, 'Tasks')
    addon.browserTabsActivate.mockResolvedValueOnce('notfound')
    expect(await browserTabs.activateTab(CHROME_WINDOW, 9, 'Gone')).toBe(false)
  })

  it('stops waiting for a listing that outlives the deadline and queues no second one behind it', async () => {
    vi.useFakeTimers()
    const addon = fakeAddon()
    addon.browserTabsList.mockImplementation(neverSettles)
    const browserTabs = bindBrowserTabs(addon, 1000)
    const first = expect(browserTabs.listTabs()).rejects.toThrow(/listing browser tabs took longer than 1000 ms/)
    const second = expect(browserTabs.listTabs()).rejects.toThrow(/took longer/)
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.all([first, second])
    expect(addon.browserTabsList).toHaveBeenCalledOnce()
  })

  it('stops waiting for a tab selection that outlives the deadline', async () => {
    vi.useFakeTimers()
    const addon = fakeAddon()
    addon.browserTabsActivate.mockImplementation(neverSettles)
    const selection = expect(bindBrowserTabs(addon, 1000).activateTab(CHROME_WINDOW, 0, 'Inbox')).rejects.toThrow(
      /selecting a browser tab took longer/
    )
    await vi.advanceTimersByTimeAsync(1000)
    await selection
  })

  it('warms the browser tabs thread without listing anything', async () => {
    const addon = fakeAddon()
    await bindBrowserTabs(addon).warm()
    expect(addon.browserTabsWarm).toHaveBeenCalledOnce()
    expect(addon.browserTabsList).not.toHaveBeenCalled()
  })

  it('refuses an add-on built before browser tabs existed', () => {
    expect(() => bindBrowserTabs({ appActivate: async () => 0 })).toThrow(/no browser tab exports/)
  })
})

describe('loadNativeBrowserTabs', () => {
  it('loads the add-on from the electron native folder', () => {
    const requireAddon = vi.fn(() => fakeAddon())
    expect(loadNativeBrowserTabs(requireAddon)?.kind).toBe('native')
    expect(requireAddon).toHaveBeenCalledWith(NATIVE_ADDON_PATH)
  })

  it('gives up quietly when the add-on was not built', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const missing = () => {
      throw new Error('Cannot find module')
    }
    expect(loadNativeBrowserTabs(missing)).toBeNull()
  })

  it('gives up when the add-on lacks the browser tab exports', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadNativeBrowserTabs(() => ({}))).toBeNull()
  })
})

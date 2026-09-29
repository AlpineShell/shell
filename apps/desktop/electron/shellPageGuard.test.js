import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import path from 'path'
import { pathToFileURL } from 'url'

const { keepToShellPages } = await import('./shellPageGuard.js')

const INDEX_PATH = path.resolve(path.join(path.sep, 'Programs', 'Alpine Shell', 'resources', 'app.asar', 'dist', 'index.html'))
const INDEX_URL = pathToFileURL(INDEX_PATH).href
const PACKAGED = { indexPath: INDEX_PATH, devServerUrl: null }
const ANDROID_PAGE = 'alpine-plugin://com.alpine.android/window/page.html'

function fakeContents(committedUrl = '') {
  const contents = new EventEmitter()
  contents.committedUrl = committedUrl
  contents.getURL = () => contents.committedUrl
  contents.setWindowOpenHandler = (handler) => { contents.windowOpenHandler = handler }
  return contents
}

function guarded(committedUrl) {
  const contents = fakeContents(committedUrl)
  const openLink = vi.fn()
  keepToShellPages(contents, PACKAGED, openLink)
  return { contents, openLink }
}

function navigationEvent(url, { isMainFrame = true, isSameDocument = false } = {}) {
  return { url, isMainFrame, isSameDocument, preventDefault: vi.fn() }
}

function blocks(contents, eventName, url, options) {
  const event = navigationEvent(url, options)
  contents.emit(eventName, event)
  return event.preventDefault.mock.calls.length > 0
}

describe('keepToShellPages', () => {
  it('opens no window and hands the link to the browser instead', () => {
    const { contents, openLink } = guarded(`${INDEX_URL}?mode=topbar`)
    expect(contents.windowOpenHandler({ url: 'https://www.openstreetmap.org/' })).toEqual({ action: 'deny' })
    expect(openLink).toHaveBeenCalledWith('https://www.openstreetmap.org/')
  })

  it('keeps a shell window on the shell page', () => {
    const { contents } = guarded(`${INDEX_URL}?mode=topbar`)
    expect(blocks(contents, 'will-navigate', `${INDEX_URL}?mode=topbar`)).toBe(false)
    expect(blocks(contents, 'will-navigate', 'https://evil.example/')).toBe(true)
    expect(blocks(contents, 'will-redirect', 'https://evil.example/')).toBe(true)
    expect(blocks(contents, 'will-redirect', ANDROID_PAGE)).toBe(true)
  })

  it('keeps a redirect in a plugin window on that plugin', () => {
    const { contents } = guarded(ANDROID_PAGE)
    expect(blocks(contents, 'will-redirect', 'alpine-plugin://com.alpine.android/window/other.html')).toBe(false)
    expect(blocks(contents, 'will-redirect', 'alpine-plugin://com.other.plugin/window/page.html')).toBe(true)
    expect(blocks(contents, 'will-redirect', `${INDEX_URL}?mode=settings`)).toBe(true)
    expect(blocks(contents, 'will-redirect', 'https://evil.example/')).toBe(true)
  })

  it('judges a redirect during the first load by the page that load started on', () => {
    const { contents } = guarded('')
    contents.emit('did-start-navigation', navigationEvent(ANDROID_PAGE))
    expect(blocks(contents, 'will-redirect', 'alpine-plugin://com.alpine.android/window/other.html')).toBe(false)
    expect(blocks(contents, 'will-redirect', 'alpine-plugin://com.other.plugin/window/page.html')).toBe(true)
    expect(blocks(contents, 'will-redirect', `${INDEX_URL}?mode=settings`)).toBe(true)
  })

  it('judges later redirects by the page the window is on, not by a navigation that was started and blocked', () => {
    const { contents } = guarded('')
    contents.emit('did-start-navigation', navigationEvent(ANDROID_PAGE))
    contents.committedUrl = ANDROID_PAGE
    contents.emit('did-start-navigation', navigationEvent('alpine-plugin://com.other.plugin/window/page.html'))
    expect(blocks(contents, 'will-navigate', 'alpine-plugin://com.other.plugin/window/page.html')).toBe(true)
    expect(blocks(contents, 'will-redirect', 'alpine-plugin://com.other.plugin/window/page.html')).toBe(true)
  })

  it('blocks a redirect before any load has started', () => {
    const { contents } = guarded('')
    expect(blocks(contents, 'will-redirect', `${INDEX_URL}?mode=topbar`)).toBe(true)
  })
})

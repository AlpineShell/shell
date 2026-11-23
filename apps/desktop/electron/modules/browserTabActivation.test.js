import { describe, it, expect, vi } from 'vitest'
import browserTabActivation from './browserTabActivation.js'

const { parseTabTarget, activateBrowserTab } = browserTabActivation

describe('parseTabTarget', () => {
  it('extracts integer hwnd, index and non-empty title', () => {
    expect(parseTabTarget({ hwnd: 263166, index: 2, title: 'Docs' })).toEqual({ hwnd: 263166, index: 2, title: 'Docs' })
  })

  it('rejects missing handles, invalid indices or blank titles', () => {
    expect(parseTabTarget(null)).toBeNull()
    expect(parseTabTarget({ hwnd: NaN, index: 0, title: 'Docs' })).toBeNull()
    expect(parseTabTarget({ hwnd: 10, index: 0, title: '' })).toBeNull()
  })
})

describe('activateBrowserTab', () => {
  it('activates the browser window first, selects the tab, and re-asserts focus with the same token', async () => {
    const order = []
    const result = await activateBrowserTab(
      { hwnd: 42, index: 1, title: 'Inbox' },
      {
        activateWindow: vi.fn((hwnd) => {
          order.push(['activateWindow', hwnd])
          return 7
        }),
        selectTab: vi.fn(async (hwnd, index, title) => {
          order.push(['selectTab', hwnd, index, title])
          return true
        }),
        ensureWindowFocused: vi.fn((hwnd, token) => {
          order.push(['ensureWindowFocused', hwnd, token])
          return true
        }),
      }
    )

    expect(result).toEqual({ ok: true })
    expect(order).toEqual([
      ['activateWindow', 42],
      ['selectTab', 42, 1, 'Inbox'],
      ['ensureWindowFocused', 42, 7],
    ])
  })

  it('skips re-focusing when tab selection failed', async () => {
    const ensureWindowFocused = vi.fn()
    const result = await activateBrowserTab(
      { hwnd: 42, index: 1, title: 'Inbox' },
      {
        activateWindow: vi.fn(() => 3),
        selectTab: vi.fn(async () => false),
        ensureWindowFocused,
      }
    )

    expect(result).toEqual({ ok: false })
    expect(ensureWindowFocused).not.toHaveBeenCalled()
  })

  it('reports errors without throwing and leaves focus untouched', async () => {
    const onError = vi.fn()
    const ensureWindowFocused = vi.fn()
    const result = await activateBrowserTab(
      { hwnd: 42, index: 1, title: 'Inbox' },
      {
        activateWindow: vi.fn(() => 3),
        selectTab: vi.fn(async () => { throw new Error('COM failed') }),
        ensureWindowFocused,
        onError,
      }
    )

    expect(result).toEqual({ ok: false })
    expect(onError).toHaveBeenCalledOnce()
    expect(ensureWindowFocused).not.toHaveBeenCalled()
  })
})

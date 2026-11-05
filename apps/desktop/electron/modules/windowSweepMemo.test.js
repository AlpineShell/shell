import { describe, it, expect, vi } from 'vitest'
import windowSweepMemo from './windowSweepMemo.js'

const { createSweepMemo, createWindowImageCache } = windowSweepMemo

const NOTEPAD = 0x1010
const BROWSER = 0x2020

describe('createSweepMemo', () => {
  it('reads a window once and answers later sweeps from memory', () => {
    const read = vi.fn((hwnd) => `class-${hwnd}`)
    const memo = createSweepMemo(read)
    expect(memo.valueFor(NOTEPAD)).toBe(`class-${NOTEPAD}`)
    memo.finishSweep()
    expect(memo.valueFor(NOTEPAD)).toBe(`class-${NOTEPAD}`)
    memo.finishSweep()
    expect(memo.valueFor(NOTEPAD)).toBe(`class-${NOTEPAD}`)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('answers repeated questions within one sweep from memory', () => {
    const read = vi.fn(() => 'Notepad')
    const memo = createSweepMemo(read)
    memo.valueFor(NOTEPAD)
    memo.valueFor(NOTEPAD)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('reads a window again once a whole sweep has passed without it', () => {
    const read = vi.fn((hwnd) => hwnd)
    const memo = createSweepMemo(read)
    memo.valueFor(NOTEPAD)
    memo.finishSweep()
    memo.valueFor(BROWSER)
    memo.finishSweep()
    memo.valueFor(NOTEPAD)
    expect(read.mock.calls.map(([hwnd]) => hwnd)).toEqual([NOTEPAD, BROWSER, NOTEPAD])
  })

  it('remembers an empty answer like any other', () => {
    const read = vi.fn(() => 0)
    const memo = createSweepMemo(read)
    expect(memo.valueFor(NOTEPAD)).toBe(0)
    memo.finishSweep()
    expect(memo.valueFor(NOTEPAD)).toBe(0)
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('createWindowImageCache', () => {
  const nameFromPath = (exePath) => exePath.split('/').pop()

  it('looks a window up once while it keeps its process', () => {
    const readImagePath = vi.fn(() => '/apps/notepad')
    const cache = createWindowImageCache(readImagePath, nameFromPath)
    expect(cache.imageFor(NOTEPAD, 40)).toEqual({ processId: 40, exePath: '/apps/notepad', name: 'notepad' })
    expect(cache.imageFor(NOTEPAD, 40)).toEqual({ processId: 40, exePath: '/apps/notepad', name: 'notepad' })
    expect(readImagePath).toHaveBeenCalledTimes(1)
    expect(readImagePath).toHaveBeenCalledWith(40)
  })

  it('looks the window up again when the handle now belongs to another process', () => {
    const readImagePath = vi.fn((processId) => (processId === 40 ? '/apps/notepad' : '/apps/browser'))
    const cache = createWindowImageCache(readImagePath, nameFromPath)
    cache.imageFor(NOTEPAD, 40)
    expect(cache.imageFor(NOTEPAD, 77)).toEqual({ processId: 77, exePath: '/apps/browser', name: 'browser' })
    expect(readImagePath).toHaveBeenCalledTimes(2)
  })

  it('does not remember a failed lookup', () => {
    const readImagePath = vi.fn().mockReturnValueOnce(null).mockReturnValue('/apps/notepad')
    const cache = createWindowImageCache(readImagePath, nameFromPath)
    expect(cache.imageFor(NOTEPAD, 40)).toBeNull()
    expect(cache.imageFor(NOTEPAD, 40)).toEqual({ processId: 40, exePath: '/apps/notepad', name: 'notepad' })
    expect(readImagePath).toHaveBeenCalledTimes(2)
  })

  it('forgets windows that are no longer listed', () => {
    const readImagePath = vi.fn(() => '/apps/notepad')
    const cache = createWindowImageCache(readImagePath, nameFromPath)
    cache.imageFor(NOTEPAD, 40)
    cache.imageFor(BROWSER, 41)
    cache.retainOnly([BROWSER])
    cache.imageFor(BROWSER, 41)
    cache.imageFor(NOTEPAD, 40)
    expect(readImagePath.mock.calls.map(([processId]) => processId)).toEqual([40, 41, 40])
  })
})

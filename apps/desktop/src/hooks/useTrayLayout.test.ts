import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { StrictMode } from 'react'
import { useTrayLayout } from './useTrayLayout'

type TrayLayoutListener = (layout: TrayLayout) => void

interface PendingLayoutRead {
  resolve: (layout: TrayLayout) => void
  reject: (error: Error) => void
}

const EMPTY: TrayLayout = { order: [], hidden: [] }
const DROPBOX_FIRST: TrayLayout = { order: ['dropbox', 'teams'], hidden: ['onedrive'] }
const TEAMS_FIRST: TrayLayout = { order: ['teams', 'dropbox'], hidden: [] }

let layoutReads: PendingLayoutRead[]
let layoutListeners: TrayLayoutListener[]
let removeLayoutListener: ReturnType<typeof vi.fn>
let setLayout: ReturnType<typeof vi.fn>

beforeEach(() => {
  layoutReads = []
  layoutListeners = []
  removeLayoutListener = vi.fn()
  setLayout = vi.fn((layout: TrayLayout) => Promise.resolve(layout))
  ;(window as unknown as { shell: unknown }).shell = {
    tray: {
      layout: () => new Promise<TrayLayout>((resolve, reject) => layoutReads.push({ resolve, reject })),
      onLayoutChanged: (listener: TrayLayoutListener) => {
        layoutListeners.push(listener)
        return removeLayoutListener
      },
      setLayout,
    },
  }
})

afterEach(() => {
  delete (window as unknown as { shell?: unknown }).shell
})

describe('useTrayLayout', () => {
  it('starts empty, then shows the stored layout', async () => {
    const { result } = renderHook(() => useTrayLayout())
    expect(result.current.layout).toEqual(EMPTY)

    await act(async () => layoutReads[0].resolve(DROPBOX_FIRST))
    expect(result.current.layout).toEqual(DROPBOX_FIRST)
  })

  it('follows a layout another window pushes', () => {
    const { result } = renderHook(() => useTrayLayout())
    act(() => layoutListeners[0](TEAMS_FIRST))
    expect(result.current.layout).toEqual(TEAMS_FIRST)
  })

  it('shows a new layout at once and hands it to the tray', () => {
    const { result } = renderHook(() => useTrayLayout())
    act(() => result.current.setLayout(TEAMS_FIRST))
    expect(result.current.layout).toEqual(TEAMS_FIRST)
    expect(setLayout).toHaveBeenCalledWith(TEAMS_FIRST)
  })

  it('removes its layout listener when it unmounts', () => {
    const { unmount } = renderHook(() => useTrayLayout())
    expect(removeLayoutListener).not.toHaveBeenCalled()

    unmount()
    expect(removeLayoutListener).toHaveBeenCalledTimes(1)
  })

  it('keeps a newer layout when a read from a torn-down subscription answers late', async () => {
    const { result } = renderHook(() => useTrayLayout(), { wrapper: StrictMode })
    expect(layoutReads).toHaveLength(2)
    expect(removeLayoutListener).toHaveBeenCalledTimes(1)

    await act(async () => layoutReads[1].resolve(TEAMS_FIRST))
    await act(async () => layoutReads[0].resolve(DROPBOX_FIRST))
    expect(result.current.layout).toEqual(TEAMS_FIRST)
  })

  it('ignores a push that reaches a torn-down subscription', () => {
    const { result } = renderHook(() => useTrayLayout(), { wrapper: StrictMode })
    expect(layoutListeners).toHaveLength(2)

    act(() => layoutListeners[1](TEAMS_FIRST))
    act(() => layoutListeners[0](DROPBOX_FIRST))
    expect(result.current.layout).toEqual(TEAMS_FIRST)
  })

  it('keeps its empty layout when the tray cannot read one', async () => {
    const { result } = renderHook(() => useTrayLayout())
    await act(async () => layoutReads[0].reject(new Error('tray module is not running')))
    expect(result.current.layout).toEqual(EMPTY)
  })
})

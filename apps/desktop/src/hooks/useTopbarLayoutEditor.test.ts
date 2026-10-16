import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EMPTY_TOPBAR_LAYOUT, resolveTopbarLayout, storeTopbarLayout } from '../components/topbar/layout/topbarLayout'
import { isDefaultTopbarArrangement, moveTopbarItem } from '../components/topbar/layout/topbarLayoutEdits'

const CLOCK_IN_CENTER: StoredTopbarLayout = {
  slots: { left: [], center: ['launcher', 'clock'], right: [] },
  hidden: [],
}

const MEDIA_HIDDEN: StoredTopbarLayout = {
  slots: { left: [], center: [], right: [] },
  hidden: ['media'],
}

let useTopbarLayoutEditor: typeof import('./useTopbarLayoutEditor').useTopbarLayoutEditor

const neverSettles = () => new Promise<StoredTopbarLayout>(() => {})

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

function installTopbarBridge(initialLayout: StoredTopbarLayout | null = null) {
  let push: (layout: StoredTopbarLayout) => void = () => {}
  const unsubscribe = vi.fn()
  const bridge = {
    initialLayout,
    layout: vi.fn<() => Promise<StoredTopbarLayout>>(() => Promise.resolve(EMPTY_TOPBAR_LAYOUT)),
    setLayout: vi.fn<(layout: TopbarLayoutPatch) => Promise<StoredTopbarLayout>>((layout) =>
      Promise.resolve(layout as StoredTopbarLayout)
    ),
    onLayoutChanged: vi.fn((callback: (layout: StoredTopbarLayout) => void) => {
      push = callback
      return unsubscribe
    }),
  }
  Object.assign(window, { topbar: bridge })
  return { bridge, unsubscribe, broadcast: (layout: StoredTopbarLayout) => push(layout) }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function clockMovedToCenter(items: TopbarLayoutItem[]) {
  return moveTopbarItem(items, 'clock', { slot: 'center', index: 1 })
}

beforeEach(async () => {
  vi.resetModules()
  useTopbarLayoutEditor = (await import('./useTopbarLayoutEditor')).useTopbarLayoutEditor
})

afterEach(() => {
  delete (window as unknown as { topbar?: unknown }).topbar
})

describe('useTopbarLayoutEditor', () => {
  it('starts from the layout the window booted with', () => {
    const { bridge } = installTopbarBridge(CLOCK_IN_CENTER)
    bridge.layout.mockImplementation(neverSettles)
    const { result } = renderHook(() => useTopbarLayoutEditor())

    expect(result.current.items).toEqual(resolveTopbarLayout(CLOCK_IN_CENTER))
    expect(result.current.error).toBeNull()
  })

  it('adopts the layout it reads when it mounts', async () => {
    const { bridge } = installTopbarBridge()
    bridge.layout.mockResolvedValue(CLOCK_IN_CENTER)
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()

    expect(result.current.items).toEqual(resolveTopbarLayout(CLOCK_IN_CENTER))
  })

  it('sends every slot and the hidden set in one write', async () => {
    const { bridge } = installTopbarBridge()
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()

    await act(async () => {
      await result.current.commit(clockMovedToCenter(result.current.items))
    })

    expect(bridge.setLayout).toHaveBeenCalledTimes(1)
    expect(bridge.setLayout).toHaveBeenCalledWith({
      slots: {
        left: ['system-menu', 'plugins-left', 'desktops', 'desktop-lines'],
        center: ['launcher', 'clock'],
        right: ['tray', 'media', 'microphone', 'status', 'plugins-right'],
      },
      hidden: ['desktop-lines'],
    })
  })

  it('shows a commit before the bar confirms it', async () => {
    const { bridge } = installTopbarBridge()
    bridge.setLayout.mockImplementation(neverSettles)
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()
    const moved = clockMovedToCenter(result.current.items)

    act(() => {
      result.current.commit(moved)
    })

    expect(result.current.items).toEqual(moved)
  })

  it('ignores broadcasts while a write is pending and takes them again once it settles', async () => {
    const { bridge, broadcast } = installTopbarBridge()
    const write = deferred<StoredTopbarLayout>()
    bridge.setLayout.mockReturnValue(write.promise)
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()
    const moved = clockMovedToCenter(result.current.items)

    let committed: Promise<boolean> = Promise.resolve(false)
    act(() => {
      committed = result.current.commit(moved)
    })
    act(() => broadcast(EMPTY_TOPBAR_LAYOUT))
    expect(result.current.items).toEqual(moved)

    await act(async () => {
      write.resolve(storeTopbarLayout(moved))
      await committed
    })
    act(() => broadcast(MEDIA_HIDDEN))
    expect(result.current.items).toEqual(resolveTopbarLayout(MEDIA_HIDDEN))
  })

  it('resolves true once the bar saves the layout', async () => {
    installTopbarBridge()
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()

    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current.commit(clockMovedToCenter(result.current.items))
    })

    expect(saved).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('re-reads the layout, says why and resolves false when a write is refused', async () => {
    const { bridge } = installTopbarBridge()
    bridge.layout.mockResolvedValue(MEDIA_HIDDEN)
    bridge.setLayout.mockRejectedValue(new Error('EPERM: operation not permitted'))
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()

    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current.commit(clockMovedToCenter(result.current.items))
    })

    expect(saved).toBe(false)
    expect(bridge.layout).toHaveBeenCalledTimes(2)
    expect(result.current.items).toEqual(resolveTopbarLayout(MEDIA_HIDDEN))
    expect(result.current.error).toBe('Ridge could not save that change.')
  })

  it('clears a refusal when a later write lands', async () => {
    const { bridge } = installTopbarBridge()
    bridge.setLayout.mockRejectedValueOnce(new Error('EPERM: operation not permitted'))
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()
    const moved = clockMovedToCenter(result.current.items)

    await act(async () => {
      await result.current.commit(moved)
    })
    expect(result.current.error).not.toBeNull()

    await act(async () => {
      await result.current.commit(moved)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.items).toEqual(moved)
  })

  it('resets by sending the empty layout', async () => {
    const { bridge } = installTopbarBridge()
    bridge.layout.mockResolvedValue(CLOCK_IN_CENTER)
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()

    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current.reset()
    })

    expect(saved).toBe(true)
    expect(bridge.setLayout).toHaveBeenCalledTimes(1)
    expect(bridge.setLayout).toHaveBeenCalledWith(EMPTY_TOPBAR_LAYOUT)
    expect(isDefaultTopbarArrangement(result.current.items)).toBe(true)
  })

  it('keeps a commit when a read that started before it resolves late', async () => {
    const { bridge } = installTopbarBridge()
    const mountRead = deferred<StoredTopbarLayout>()
    bridge.layout.mockReturnValueOnce(mountRead.promise)
    const { result } = renderHook(() => useTopbarLayoutEditor())
    const moved = clockMovedToCenter(result.current.items)

    await act(async () => {
      await result.current.commit(moved)
    })
    mountRead.resolve(EMPTY_TOPBAR_LAYOUT)
    await settle()

    expect(result.current.items).toEqual(moved)
  })

  it('lets the last of overlapping writes settle the layout', async () => {
    const { bridge } = installTopbarBridge()
    const firstWrite = deferred<StoredTopbarLayout>()
    const secondWrite = deferred<StoredTopbarLayout>()
    bridge.setLayout.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise)
    const { result } = renderHook(() => useTopbarLayoutEditor())
    await settle()
    const clockInCenter = clockMovedToCenter(result.current.items)
    const clockOpensCenter = moveTopbarItem(clockInCenter, 'clock', { slot: 'center', index: 0 })

    let first: Promise<boolean> = Promise.resolve(false)
    let second: Promise<boolean> = Promise.resolve(false)
    act(() => {
      first = result.current.commit(clockInCenter)
    })
    act(() => {
      second = result.current.commit(clockOpensCenter)
    })

    await act(async () => {
      firstWrite.resolve(storeTopbarLayout(clockInCenter))
      await first
    })
    expect(result.current.items).toEqual(clockOpensCenter)

    await act(async () => {
      secondWrite.resolve(storeTopbarLayout(clockOpensCenter))
      await second
    })
    expect(result.current.items).toEqual(clockOpensCenter)
  })

  it('stops listening for broadcasts when it unmounts', () => {
    const { bridge, unsubscribe } = installTopbarBridge()
    bridge.layout.mockImplementation(neverSettles)
    const { unmount } = renderHook(() => useTopbarLayoutEditor())
    expect(bridge.onLayoutChanged).toHaveBeenCalledTimes(1)

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('starts a remount from the last layout it knew', async () => {
    const { bridge } = installTopbarBridge()
    bridge.layout.mockResolvedValueOnce(CLOCK_IN_CENTER)
    const first = renderHook(() => useTopbarLayoutEditor())
    await settle()
    first.unmount()

    bridge.layout.mockImplementation(neverSettles)
    const second = renderHook(() => useTopbarLayoutEditor())

    expect(second.result.current.items).toEqual(resolveTopbarLayout(CLOCK_IN_CENTER))
  })
})

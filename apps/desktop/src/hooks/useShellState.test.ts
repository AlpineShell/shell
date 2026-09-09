import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useShellState } from './useShellState'

describe('useShellState', () => {
  it('returns the initial value before the fetch resolves', () => {
    const { result } = renderHook(() => useShellState('initial', vi.fn().mockResolvedValue('resolved'), vi.fn()))
    expect(result.current).toBe('initial')
  })

  it('updates to the fetched value', async () => {
    const { result } = renderHook(() => useShellState('initial', vi.fn().mockResolvedValue('resolved'), vi.fn()))
    await waitFor(() => expect(result.current).toBe('resolved'))
  })

  it('subscribes once and re-renders on pushed updates', async () => {
    let pushed: ((value: string) => void) | undefined
    const subscribe = vi.fn((callback: (value: string) => void) => {
      pushed = callback
    })
    const { result } = renderHook(() => useShellState('initial', vi.fn().mockResolvedValue('first'), subscribe))

    await waitFor(() => expect(result.current).toBe('first'))
    expect(subscribe).toHaveBeenCalledTimes(1)

    act(() => pushed?.('pushed'))
    expect(result.current).toBe('pushed')
  })

  it('calls the cleanup returned by subscribe on unmount', async () => {
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(() => unsubscribe)
    const { unmount } = renderHook(() => useShellState('initial', vi.fn().mockResolvedValue('first'), subscribe))

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('starts a later mount from the last value seen on the same channel', async () => {
    const fetch = vi.fn().mockResolvedValue('resolved')
    const first = renderHook(() => useShellState('initial', fetch, vi.fn()))
    await waitFor(() => expect(first.result.current).toBe('resolved'))
    first.unmount()

    const second = renderHook(() => useShellState('initial', fetch, vi.fn()))
    expect(second.result.current).toBe('resolved')
  })

  it('ignores a pushed update after unmount', async () => {
    let pushed: ((value: string) => void) | undefined
    const subscribe = vi.fn((callback: (value: string) => void) => {
      pushed = callback
      return () => {}
    })
    const { result, unmount } = renderHook(() => useShellState('initial', vi.fn().mockResolvedValue('first'), subscribe))

    await waitFor(() => expect(result.current).toBe('first'))
    unmount()
    act(() => pushed?.('pushed'))
    expect(result.current).toBe('first')
  })
})

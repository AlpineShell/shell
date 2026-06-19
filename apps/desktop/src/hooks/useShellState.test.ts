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
})

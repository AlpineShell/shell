import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMinuteTick } from './useMinuteTick'

const at = (iso: string) => new Date(iso).getTime()

type ResumeSubscription = (callback: () => void) => () => void

const stubResumeChannel = (onResume: ResumeSubscription) => {
  ;(window as unknown as { shell: { system: { onResume: ResumeSubscription } } }).shell = { system: { onResume } }
}

afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { shell?: unknown }).shell
})

describe('useMinuteTick', () => {
  it('returns the current time on first render', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:20.000Z'))
    const { result } = renderHook(() => useMinuteTick())
    expect(result.current.getTime()).toBe(at('2026-08-24T11:35:20.000Z'))
  })

  it('does not re-render before the minute boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:20.000Z'))
    const { result } = renderHook(() => useMinuteTick())
    act(() => {
      vi.advanceTimersByTime(39_999)
    })
    expect(result.current.getTime()).toBe(at('2026-08-24T11:35:20.000Z'))
  })

  it('never reports a time that is still inside the previous minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:59.990Z'))
    const { result } = renderHook(() => useMinuteTick())
    act(() => {
      vi.advanceTimersByTime(30)
    })
    expect(result.current.getTime()).toBe(at('2026-08-24T11:36:00.020Z'))
  })

  it('re-aligns to the boundary after every tick instead of drifting', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:59.990Z'))
    const { result } = renderHook(() => useMinuteTick())
    act(() => {
      vi.advanceTimersByTime(30)
    })
    act(() => {
      vi.advanceTimersByTime(59_980)
    })
    expect(result.current.getTime()).toBe(at('2026-08-24T11:36:00.020Z'))
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(result.current.getTime()).toBe(at('2026-08-24T11:37:00.020Z'))
  })

  it('subscribes to the main process resume broadcast and unsubscribes on unmount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:20.000Z'))
    const unsubscribe = vi.fn()
    const onResume = vi.fn(() => unsubscribe)
    stubResumeChannel(onResume)
    const { unmount } = renderHook(() => useMinuteTick())
    expect(onResume).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('catches up on a resume that lands mid-minute and re-aligns to the next boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:20.000Z'))
    let notifyResume = () => {}
    stubResumeChannel((callback) => {
      notifyResume = callback
      return () => {}
    })
    const { result } = renderHook(() => useMinuteTick())
    act(() => {
      vi.setSystemTime(at('2026-08-24T12:14:30.000Z'))
      notifyResume()
    })
    expect(result.current.getTime()).toBe(at('2026-08-24T12:14:30.000Z'))
    act(() => {
      vi.advanceTimersByTime(29_999)
    })
    expect(result.current.getTime()).toBe(at('2026-08-24T12:14:30.000Z'))
    act(() => {
      vi.advanceTimersByTime(21)
    })
    expect(result.current.getTime()).toBe(at('2026-08-24T12:15:00.020Z'))
  })

  it('keeps the same Date when a resync lands inside the minute already displayed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:20.000Z'))
    let notifyResume = () => {}
    stubResumeChannel((callback) => {
      notifyResume = callback
      return () => {}
    })
    const { result } = renderHook(() => useMinuteTick())
    const first = result.current
    act(() => {
      vi.setSystemTime(at('2026-08-24T11:35:47.000Z'))
      notifyResume()
    })
    expect(result.current).toBe(first)
  })

  it('works without the shell bridge and stops its timer on unmount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-08-24T11:35:20.000Z'))
    const { unmount } = renderHook(() => useMinuteTick())
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVolumeFeedback, VOLUME_FEEDBACK_SHOWN_MS } from './useVolumeFeedback'

let pushVolume: (value: number) => void = () => {}
let pushMuted: (value: boolean) => void = () => {}
let removeVolumeListener: ReturnType<typeof vi.fn>
let removeMuteListener: ReturnType<typeof vi.fn>

function stubAudio(initialVolume: number, initialMuted: boolean) {
  removeVolumeListener = vi.fn()
  removeMuteListener = vi.fn()
  ;(window as unknown as { shell: unknown }).shell = {
    system: {
      volume: () => Promise.resolve(initialVolume),
      mute: () => Promise.resolve(initialMuted),
      onVolumeChanged: (listener: (value: number) => void) => {
        pushVolume = listener
        return removeVolumeListener
      },
      onMuteChanged: (listener: (value: boolean) => void) => {
        pushMuted = listener
        return removeMuteListener
      },
    },
  }
}

async function renderSettled() {
  const rendered = renderHook(() => useVolumeFeedback())
  await act(async () => {})
  return rendered
}

beforeEach(() => {
  vi.useFakeTimers()
  stubAudio(40, false)
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { shell?: unknown }).shell
})

describe('useVolumeFeedback', () => {
  it('reports the current level without showing it', async () => {
    const { result } = await renderSettled()
    expect(result.current).toEqual({ level: 0.4, showing: false })
  })

  it('shows a pushed volume change and hides it once the volume stays put', async () => {
    const { result } = await renderSettled()
    act(() => pushVolume(46))
    expect(result.current).toEqual({ level: 0.46, showing: true })
    act(() => {
      vi.advanceTimersByTime(VOLUME_FEEDBACK_SHOWN_MS - 1)
    })
    expect(result.current.showing).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toEqual({ level: 0.46, showing: false })
  })

  it('keeps showing while the volume keeps changing', async () => {
    const { result } = await renderSettled()
    act(() => pushVolume(42))
    act(() => {
      vi.advanceTimersByTime(VOLUME_FEEDBACK_SHOWN_MS - 100)
    })
    act(() => pushVolume(44))
    act(() => {
      vi.advanceTimersByTime(VOLUME_FEEDBACK_SHOWN_MS - 100)
    })
    expect(result.current).toEqual({ level: 0.44, showing: true })
  })

  it('stays hidden when a push repeats the volume it already knew', async () => {
    const { result } = await renderSettled()
    act(() => pushVolume(40))
    expect(result.current.showing).toBe(false)
  })

  it('stays hidden when a push arrives before the first read answered', () => {
    const { result } = renderHook(() => useVolumeFeedback())
    act(() => pushVolume(40))
    expect(result.current.showing).toBe(false)
  })

  it('drops the level to nothing and shows it when the sound is muted', async () => {
    const { result } = await renderSettled()
    act(() => pushMuted(true))
    expect(result.current).toEqual({ level: 0, showing: true })
  })

  it('stops listening when it unmounts', async () => {
    const { unmount } = await renderSettled()
    unmount()
    expect(removeVolumeListener).toHaveBeenCalledOnce()
    expect(removeMuteListener).toHaveBeenCalledOnce()
  })
})

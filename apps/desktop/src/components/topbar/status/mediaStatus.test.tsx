import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import MediaStatus from './mediaStatus'

const media = vi.hoisted(() => ({
  playback: {} as MediaPlayback,
  showVisualizer: true,
}))

vi.mock('../../../hooks/useMediaSession', () => ({
  useMediaSession: () => ({ ...media.playback, control: () => {}, update: () => {} }),
}))
vi.mock('../../../hooks/useMediaVisualizer', () => ({ useMediaVisualizer: () => media.showVisualizer }))
vi.mock('../../../hooks/useMediaTimeline', () => ({ useMediaTimeline: () => null }))
vi.mock('../shared/popupMenu', () => ({ default: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</> }))

const APP_ICON = 'iVBORw0KGgo='

let subscribePeak: ReturnType<typeof vi.fn>
let unsubscribePeak: ReturnType<typeof vi.fn>
let removePeakListener: ReturnType<typeof vi.fn>
let pushPeak: (peak: number) => void = () => {}

function nowPlaying(over: Partial<MediaPlayback> = {}) {
  media.playback = {
    title: 'Blue in Green',
    artist: 'Miles Davis',
    appName: 'Spotify',
    appIcon: APP_ICON,
    playing: true,
    thumbnail: null,
    thumbnailType: null,
    ...over,
  }
}

function barHeights(container: HTMLElement) {
  return Array.from(container.querySelectorAll('rect')).map((rect) => Number(rect.getAttribute('height')))
}

beforeEach(() => {
  subscribePeak = vi.fn()
  unsubscribePeak = vi.fn()
  removePeakListener = vi.fn()
  ;(window as unknown as { shell: unknown }).shell = {
    system: {
      subscribePeak,
      unsubscribePeak,
      onAudioPeak: (listener: (peak: number) => void) => {
        pushPeak = listener
        return removePeakListener
      },
    },
  }
  media.showVisualizer = true
  nowPlaying()
})

describe('MediaStatus and the audio peak', () => {
  it('never listens for the peak while nothing with a title is playing', () => {
    nowPlaying({ title: null })
    const { container } = render(<MediaStatus />)
    expect(container.innerHTML).toBe('')
    expect(subscribePeak).not.toHaveBeenCalled()
  })

  it('never listens for the peak while the app icon stands in for the bars', () => {
    media.showVisualizer = false
    const { container } = render(<MediaStatus />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(subscribePeak).not.toHaveBeenCalled()
  })

  it('never listens for the peak while the track is paused', () => {
    nowPlaying({ playing: false })
    render(<MediaStatus />)
    expect(subscribePeak).not.toHaveBeenCalled()
  })

  it('listens once while a titled track plays with the visualizer on', () => {
    const { rerender } = render(<MediaStatus />)
    rerender(<MediaStatus />)
    expect(subscribePeak).toHaveBeenCalledTimes(1)
    expect(unsubscribePeak).not.toHaveBeenCalled()
  })

  it('draws the peak it hears into the bars', () => {
    const { container } = render(<MediaStatus />)
    expect(barHeights(container)).toEqual([2, 2, 2, 2, 2])

    act(() => pushPeak(1))
    expect(barHeights(container)[3]).toBe(13)
  })

  it('stops listening when the track pauses', () => {
    const { rerender } = render(<MediaStatus />)
    nowPlaying({ playing: false })
    rerender(<MediaStatus />)
    expect(removePeakListener).toHaveBeenCalledTimes(1)
    expect(unsubscribePeak).toHaveBeenCalledTimes(1)
  })

  it('stops listening when the title goes away, and leaves the bar', () => {
    const { container, rerender } = render(<MediaStatus />)
    nowPlaying({ title: null })
    rerender(<MediaStatus />)
    expect(container.innerHTML).toBe('')
    expect(removePeakListener).toHaveBeenCalledTimes(1)
    expect(unsubscribePeak).toHaveBeenCalledTimes(1)
  })
})

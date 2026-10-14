import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import MediaMenu from './mediaMenu'
import { setChromeSurface } from '../chrome/chromeStore'

function playback(over: Partial<MediaPlayback> = {}) {
  return {
    title: 'Blue in Green',
    artist: 'Miles Davis',
    appName: 'Spotify',
    appIcon: null,
    playing: true,
    thumbnail: 'aGVsbG8=',
    thumbnailType: 'image/png',
    control: vi.fn(),
    ...over,
  }
}

const seek = vi.fn(async () => true)

function openAsSurface(contentEl: HTMLElement) {
  act(() => setChromeSurface({ id: 1, centerX: 200, bodyWidth: 320, fullHeight: 90, anchor: 'center', contentEl }))
}

afterEach(() => {
  act(() => setChromeSurface(null))
})

describe('MediaMenu', () => {
  it('lays the cover behind the track as a background', () => {
    const { container } = render(<MediaMenu timeline={null} onSeek={seek} media={playback()} darkText={false} />)
    openAsSurface(container)
    const cover = document.body.querySelector('img')
    expect(cover?.getAttribute('src')).toBe('data:image/png;base64,aGVsbG8=')
    expect(screen.getByText('Blue in Green')).toBeTruthy()
    expect(screen.getByText('Miles Davis')).toBeTruthy()
  })

  it('puts the title above the controls', () => {
    render(<MediaMenu timeline={null} onSeek={seek} media={playback()} darkText={false} />)
    const title = screen.getByText('Blue in Green')
    const pause = screen.getByRole('button', { name: 'Pause' })
    expect(title.compareDocumentPosition(pause) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('falls back to a plain layout without a cover', () => {
    const { container } = render(<MediaMenu timeline={null} onSeek={seek} media={playback({ thumbnail: null })} darkText={false} />)
    openAsSurface(container)
    expect(document.body.querySelector('img')).toBeNull()
    expect(screen.getByText('Blue in Green')).toBeTruthy()
  })

  it('orders the controls previous, play and next, and sends each action', () => {
    const media = playback({ playing: false })
    render(<MediaMenu timeline={null} onSeek={seek} media={media} darkText={false} />)
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Previous', 'Play', 'Next'])
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(media.control.mock.calls.map(([action]) => action)).toEqual(['previous', 'toggle', 'next'])
  })

  it('shows how far the track has played', () => {
    const timeline: MediaTimeline = { positionMs: 65000, durationMs: 200000, updatedAt: 0, playing: false, canSeek: false }
    render(<MediaMenu timeline={timeline} onSeek={seek} media={playback()} darkText={false} />)
    const bar = screen.getByRole('progressbar', { name: 'Playback' })
    expect(bar.getAttribute('aria-valuenow')).toBe('65')
    expect(bar.getAttribute('aria-valuemax')).toBe('200')
    expect(screen.getByText('1:05')).toBeTruthy()
    expect(screen.getByText('3:20')).toBeTruthy()
  })

  it('leaves the progress bar out when the app reports no timeline', () => {
    render(<MediaMenu timeline={null} onSeek={seek} media={playback()} darkText={false} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

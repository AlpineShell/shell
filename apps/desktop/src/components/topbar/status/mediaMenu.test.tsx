import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MediaMenu from './mediaMenu'

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

describe('MediaMenu', () => {
  it('lays the cover behind the track as a background', () => {
    const { container } = render(<MediaMenu media={playback()} darkText={false} />)
    const cover = container.querySelector('img')
    expect(cover?.getAttribute('src')).toBe('data:image/png;base64,aGVsbG8=')
    expect(cover?.style.position).toBe('absolute')
    expect(screen.getByText('Blue in Green')).toBeTruthy()
    expect(screen.getByText('Miles Davis')).toBeTruthy()
  })

  it('puts the title above the controls', () => {
    render(<MediaMenu media={playback()} darkText={false} />)
    const title = screen.getByText('Blue in Green')
    const pause = screen.getByRole('button', { name: 'Pause' })
    expect(title.compareDocumentPosition(pause) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('falls back to a plain layout without a cover', () => {
    const { container } = render(<MediaMenu media={playback({ thumbnail: null })} darkText={false} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Blue in Green')).toBeTruthy()
  })

  it('orders the controls previous, play and next, and sends each action', () => {
    const media = playback({ playing: false })
    render(<MediaMenu media={media} darkText={false} />)
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Previous', 'Play', 'Next'])
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(media.control.mock.calls.map(([action]) => action)).toEqual(['previous', 'toggle', 'next'])
  })
})

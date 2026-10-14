import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import MediaProgress from './mediaProgress'

const TRACK: MediaTimeline = { positionMs: 10000, durationMs: 200000, updatedAt: 1_000_000, playing: false, canSeek: true }

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function playedSeconds() {
  return Number(screen.getByLabelText('Playback').getAttribute('aria-valuenow'))
}

function renderSeekable(onSeek = vi.fn(async () => true)) {
  render(<MediaProgress timeline={TRACK} darkText={false} onSeek={onSeek} />)
  const slider = screen.getByRole('slider', { name: 'Playback' })
  vi.spyOn(slider.firstElementChild as HTMLElement, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 200, right: 300, top: 0, bottom: 4, height: 4, x: 100, y: 0, toJSON: () => ({}) } as DOMRect)
  return { slider, onSeek }
}

describe('MediaProgress', () => {
  it('moves on by itself while the track plays', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    render(<MediaProgress timeline={{ ...TRACK, playing: true }} darkText={false} />)
    expect(playedSeconds()).toBe(10)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(playedSeconds()).toBe(15)
    expect(screen.getByText('0:15')).toBeTruthy()
  })

  it('holds still while the track is paused', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    render(<MediaProgress timeline={TRACK} darkText={false} />)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(playedSeconds()).toBe(10)
  })

  it('stays a plain progress bar when the app does not allow seeking', () => {
    render(<MediaProgress timeline={{ ...TRACK, canSeek: false }} darkText={false} onSeek={vi.fn()} />)
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Playback' })).toBeTruthy()
  })

  it('thickens under the pointer only when it can seek', () => {
    const { slider } = renderSeekable()
    expect(slider.firstElementChild?.className).toContain('group-hover:h-2')
  })

  it('follows the pointer while dragging and seeks where it is let go', async () => {
    const { slider, onSeek } = renderSeekable()
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 150 })
    expect(playedSeconds()).toBe(50)
    expect(slider.getAttribute('data-dragging')).toBe('true')

    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 250 })
    expect(playedSeconds()).toBe(150)
    expect(onSeek).not.toHaveBeenCalled()

    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 250 })
    expect(onSeek).toHaveBeenCalledWith(150000)
    expect(playedSeconds()).toBe(150)
    expect(slider.getAttribute('data-dragging')).toBe('false')
  })

  it('jumps straight to a spot that is clicked', () => {
    const { slider, onSeek } = renderSeekable()
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 300 })
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 300 })
    expect(onSeek).toHaveBeenCalledWith(200000)
  })

  it('steps five seconds with the arrow keys', () => {
    const { slider, onSeek } = renderSeekable()
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenLastCalledWith(15000)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSeek).toHaveBeenLastCalledWith(0)
  })

  it('goes back to where the track really is when the app refuses the seek', async () => {
    const { slider } = renderSeekable(vi.fn(async () => false))
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 250 })
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 250 })
    await waitFor(() => expect(playedSeconds()).toBe(10))
  })
})

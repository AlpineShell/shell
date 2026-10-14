import { describe, it, expect } from 'vitest'
import { formatMediaTime, mediaElapsedMs, positionAtPointer } from './mediaProgress'

const timeline: MediaTimeline = { positionMs: 110508, durationMs: 131706, updatedAt: 1_000_000, playing: true, canSeek: true }

describe('mediaElapsedMs', () => {
  it('runs on from where the app last measured while the track plays', () => {
    expect(mediaElapsedMs(timeline, 1_003_827)).toBe(114335)
  })

  it('stands still while the track is paused', () => {
    expect(mediaElapsedMs({ ...timeline, playing: false }, 1_003_827)).toBe(110508)
  })

  it('never runs past the end of the track', () => {
    expect(mediaElapsedMs(timeline, 9_000_000)).toBe(131706)
  })

  it('never runs backwards when the clock reads earlier than the measurement', () => {
    expect(mediaElapsedMs(timeline, 900_000)).toBe(110508)
  })

  it('does not guess when the app never said when it measured', () => {
    expect(mediaElapsedMs({ ...timeline, updatedAt: -62135596800000 }, 1_003_827)).toBe(110508)
  })
})

describe('formatMediaTime', () => {
  it('writes minutes and seconds', () => {
    expect(formatMediaTime(0)).toBe('0:00')
    expect(formatMediaTime(114335)).toBe('1:54')
    expect(formatMediaTime(131706)).toBe('2:11')
  })

  it('adds hours for long tracks', () => {
    expect(formatMediaTime(3_725_000)).toBe('1:02:05')
  })
})

describe('positionAtPointer', () => {
  it('reads the track position under the pointer', () => {
    expect(positionAtPointer(150, 100, 200, 200000)).toBe(50000)
  })

  it('pins to the start and the end past either edge', () => {
    expect(positionAtPointer(40, 100, 200, 200000)).toBe(0)
    expect(positionAtPointer(900, 100, 200, 200000)).toBe(200000)
  })

  it('reads the start when the bar has no width yet', () => {
    expect(positionAtPointer(150, 100, 0, 200000)).toBe(0)
  })
})

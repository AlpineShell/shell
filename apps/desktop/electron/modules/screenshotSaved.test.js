import { describe, expect, it } from 'vitest'

const { thumbnailSize, screenshotFileName, screenshotSavedEvent } = await import('./screenshotSaved.js')

const TAKEN_AT = new Date(2026, 10, 11, 20, 5, 12)
const nothingTaken = () => false

describe('thumbnailSize', () => {
  it('fits a full-screen capture into the thumbnail box, keeping its shape', () => {
    expect(thumbnailSize(1920, 1200)).toEqual({ width: 64, height: 40 })
  })

  it('fits a tall capture by its height', () => {
    expect(thumbnailSize(400, 1600)).toEqual({ width: 10, height: 40 })
  })

  it('never enlarges a capture smaller than the box', () => {
    expect(thumbnailSize(40, 30)).toEqual({ width: 40, height: 30 })
  })

  it('keeps a hairline capture at least one pixel thick', () => {
    expect(thumbnailSize(5000, 1)).toEqual({ width: 64, height: 1 })
  })

  it('has no size for an empty capture', () => {
    expect(thumbnailSize(0, 200)).toBeNull()
  })
})

describe('screenshotFileName', () => {
  it('names a capture after the local date and time it was taken', () => {
    expect(screenshotFileName(TAKEN_AT, nothingTaken)).toBe('2026-11-11 20.05.12.png')
  })

  it('pads single-digit months, days and times', () => {
    expect(screenshotFileName(new Date(2027, 0, 2, 3, 4, 5), nothingTaken)).toBe('2027-01-02 03.04.05.png')
  })

  it('numbers a second capture in the same second instead of overwriting the first', () => {
    const taken = new Set(['2026-11-11 20.05.12.png', '2026-11-11 20.05.12 (2).png'])
    expect(screenshotFileName(TAKEN_AT, (name) => taken.has(name))).toBe('2026-11-11 20.05.12 (3).png')
  })
})

describe('screenshotSavedEvent', () => {
  it('carries the id, thumbnail, file name and display of the capture', () => {
    expect(screenshotSavedEvent(3, 'data:image/png;base64,AAAA', 'C:\\Users\\Ana\\Pictures\\Screenshots\\2026-11-11 20.05.12.png', 7)).toEqual({
      id: 3,
      thumbnail: 'data:image/png;base64,AAAA',
      name: '2026-11-11 20.05.12.png',
      displayId: 7,
    })
  })

  it('shows on every display when the capture has none', () => {
    expect(screenshotSavedEvent(1, null, 'C:\\Shots\\a.png', undefined).displayId).toBeNull()
  })
})

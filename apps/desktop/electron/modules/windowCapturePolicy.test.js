import { describe, it, expect } from 'vitest'
import windowCapturePolicy from './windowCapturePolicy.js'

const { BITMAPINFOHEADER_BYTES, thumbnailSize, bitmapInfoHeader, makeOpaque, titleBarStrip } = windowCapturePolicy

describe('thumbnailSize', () => {
  it('shrinks a large window to fit the box and keeps its shape', () => {
    expect(thumbnailSize(1920, 1080, 320, 200)).toEqual({ width: 320, height: 180 })
    expect(thumbnailSize(800, 1600, 320, 200)).toEqual({ width: 100, height: 200 })
  })

  it('never enlarges a window smaller than the box', () => {
    expect(thumbnailSize(200, 100, 320, 200)).toEqual({ width: 200, height: 100 })
  })

  it('keeps at least one pixel on each side of a sliver', () => {
    expect(thumbnailSize(4000, 1, 320, 200)).toEqual({ width: 320, height: 1 })
  })
})

describe('bitmapInfoHeader', () => {
  it('describes a top-down 32-bit bitmap of the given size', () => {
    const header = bitmapInfoHeader(320, 180)
    expect(header.length).toBe(BITMAPINFOHEADER_BYTES)
    expect(header.readUInt32LE(0)).toBe(BITMAPINFOHEADER_BYTES)
    expect(header.readInt32LE(4)).toBe(320)
    expect(header.readInt32LE(8)).toBe(-180)
    expect(header.readUInt16LE(12)).toBe(1)
    expect(header.readUInt16LE(14)).toBe(32)
  })
})

describe('makeOpaque', () => {
  it('sets every alpha byte and leaves the colours alone', () => {
    const pixels = Buffer.from([10, 20, 30, 0, 40, 50, 60, 7])
    makeOpaque(pixels)
    expect([...pixels]).toEqual([10, 20, 30, 255, 40, 50, 60, 255])
  })
})

describe('titleBarStrip', () => {
  it('takes a thin strip across the middle of the title row at 100 %', () => {
    expect(titleBarStrip({ left: 100, top: 50, right: 1100 }, 96)).toEqual({ left: 108, top: 86, width: 984, height: 6 })
  })

  it('scales the strip with the window DPI', () => {
    expect(titleBarStrip({ left: 0, top: 0, right: 1000 }, 144)).toEqual({ left: 12, top: 55, width: 976, height: 9 })
  })

  it('treats an unknown DPI as 100 %', () => {
    expect(titleBarStrip({ left: 100, top: 50, right: 1100 }, 0)).toEqual(titleBarStrip({ left: 100, top: 50, right: 1100 }, 96))
  })

  it('gives up on a window too narrow to sample', () => {
    expect(titleBarStrip({ left: 0, top: 0, right: 16 }, 96)).toBeNull()
    expect(titleBarStrip({ left: 10, top: 0, right: 10 }, 96)).toBeNull()
  })
})

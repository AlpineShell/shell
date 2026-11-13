import { describe, it, expect } from 'vitest'
import { describeWallpaperImage, isSafeToRescale } from './wallpaperImageHeader.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const EXIF_IDENTIFIER = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00])
const ICC_IDENTIFIER = Buffer.concat([Buffer.from('ICC_PROFILE', 'latin1'), Buffer.from([0x00, 0x01, 0x01])])

function jpegSegment(marker, data) {
  const header = Buffer.from([0xff, marker, 0, 0])
  header.writeUInt16BE(data.length + 2, 2)
  return Buffer.concat([header, data])
}

function exifWithOrientation(orientation) {
  const tiff = Buffer.alloc(8 + 2 + 12)
  tiff.write('II', 0, 'latin1')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x0112, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(orientation, 18)
  return Buffer.concat([EXIF_IDENTIFIER, tiff])
}

function jpegFrame(width, height, components) {
  const frame = Buffer.alloc(6)
  frame[0] = 8
  frame.writeUInt16BE(height, 1)
  frame.writeUInt16BE(width, 3)
  frame[5] = components
  return frame
}

function jpegImage(width, height, { orientation = null, colorProfile = false, components = 3 } = {}) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...(orientation === null ? [] : [jpegSegment(0xe1, exifWithOrientation(orientation))]),
    ...(colorProfile ? [jpegSegment(0xe2, ICC_IDENTIFIER)] : []),
    jpegSegment(0xc0, jpegFrame(width, height, components)),
    Buffer.from([0xff, 0xda, 0x00, 0x02]),
  ])
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
}

function pngHeader(width, height, colorType) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = colorType
  return header
}

function pngImage(width, height, { colorType = 2, chunks = [] } = {}) {
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', pngHeader(width, height, colorType)),
    ...chunks.map((type) => pngChunk(type, Buffer.alloc(4))),
    pngChunk('IDAT', Buffer.alloc(1)),
  ])
}

describe('describeWallpaperImage', () => {
  it('reads the size of a JPEG from its frame header', () => {
    expect(describeWallpaperImage(jpegImage(3840, 2160))).toMatchObject({ format: 'jpeg', width: 3840, height: 2160, hasAlpha: false })
  })

  it('reads the size and transparency of a PNG', () => {
    expect(describeWallpaperImage(pngImage(2560, 1440))).toMatchObject({ format: 'png', width: 2560, height: 1440, hasAlpha: false })
    expect(describeWallpaperImage(pngImage(2560, 1440, { colorType: 6 })).hasAlpha).toBe(true)
    expect(describeWallpaperImage(pngImage(2560, 1440, { chunks: ['tRNS'] })).hasAlpha).toBe(true)
  })

  it('reads the EXIF orientation of a JPEG', () => {
    expect(describeWallpaperImage(jpegImage(4000, 3000, { orientation: 6 })).orientation).toBe(6)
    expect(describeWallpaperImage(jpegImage(4000, 3000, { orientation: 1 })).orientation).toBe(1)
  })

  it('notices an embedded colour profile', () => {
    expect(describeWallpaperImage(jpegImage(4000, 3000, { colorProfile: true })).colorManaged).toBe(true)
    expect(describeWallpaperImage(pngImage(4000, 3000, { chunks: ['iCCP'] })).colorManaged).toBe(true)
  })

  it('treats PNG gamma as colour management unless the image declares sRGB', () => {
    expect(describeWallpaperImage(pngImage(4000, 3000, { chunks: ['gAMA'] })).colorManaged).toBe(true)
    expect(describeWallpaperImage(pngImage(4000, 3000, { chunks: ['sRGB', 'gAMA', 'cHRM'] })).colorManaged).toBe(false)
  })

  it('notices an animated PNG', () => {
    expect(describeWallpaperImage(pngImage(4000, 3000, { chunks: ['acTL'] })).animated).toBe(true)
  })

  it('cannot describe other formats or a cut-off header', () => {
    expect(describeWallpaperImage(Buffer.from('BM not a jpeg', 'latin1'))).toBeNull()
    expect(describeWallpaperImage(jpegImage(3840, 2160).subarray(0, 8))).toBeNull()
    expect(describeWallpaperImage(pngImage(3840, 2160).subarray(0, 20))).toBeNull()
    expect(describeWallpaperImage(Buffer.alloc(0))).toBeNull()
  })
})

describe('isSafeToRescale', () => {
  it('allows an upright sRGB JPEG or PNG', () => {
    expect(isSafeToRescale(describeWallpaperImage(jpegImage(3840, 2160)))).toBe(true)
    expect(isSafeToRescale(describeWallpaperImage(jpegImage(3840, 2160, { orientation: 1 })))).toBe(true)
    expect(isSafeToRescale(describeWallpaperImage(pngImage(3840, 2160, { colorType: 6 })))).toBe(true)
  })

  it('refuses what a re-encoded copy would show differently', () => {
    expect(isSafeToRescale(describeWallpaperImage(jpegImage(3840, 2160, { orientation: 6 })))).toBe(false)
    expect(isSafeToRescale(describeWallpaperImage(jpegImage(3840, 2160, { colorProfile: true })))).toBe(false)
    expect(isSafeToRescale(describeWallpaperImage(jpegImage(3840, 2160, { components: 4 })))).toBe(false)
    expect(isSafeToRescale(describeWallpaperImage(pngImage(3840, 2160, { chunks: ['acTL'] })))).toBe(false)
    expect(isSafeToRescale(describeWallpaperImage(pngImage(3840, 2160, { chunks: ['eXIf'] })))).toBe(false)
    expect(isSafeToRescale(null)).toBe(false)
  })
})

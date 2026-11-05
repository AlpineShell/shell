import { describe, expect, it, beforeEach } from 'vitest'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
let encodedBitmaps = 0
let encodingFails = false

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    nativeImage: {
      createFromBitmap: (pixels) => {
        encodedBitmaps++
        if (encodingFails) throw new Error('cannot encode')
        return { toDataURL: () => `data:image/png;base64,${pixels.toString('base64')}` }
      },
    },
  },
}

const { encodeIconPixelsReusing, iconPixelsToDataUrl } = nodeRequire('./iconHandle.js')

const SIZE = 2

function pixelsOf(...bytes) {
  return Buffer.from(bytes)
}

describe('encodeIconPixelsReusing', () => {
  beforeEach(() => {
    encodedBitmaps = 0
    encodingFails = false
  })

  it('encodes pixels it has not seen', () => {
    const encoding = encodeIconPixelsReusing(null, pixelsOf(1, 2, 3, 255), SIZE)
    expect(encoding.dataUrl).toBe(iconPixelsToDataUrl(pixelsOf(1, 2, 3, 255), SIZE))
    expect(encodedBitmaps).toBe(2)
  })

  it('reuses the previous data url when the pixels are byte for byte the same', () => {
    const first = encodeIconPixelsReusing(null, pixelsOf(1, 2, 3, 255), SIZE)
    const second = encodeIconPixelsReusing(first, pixelsOf(1, 2, 3, 255), SIZE)
    expect(second).toBe(first)
    expect(encodedBitmaps).toBe(1)
  })

  it('encodes again when a single byte changed', () => {
    const first = encodeIconPixelsReusing(null, pixelsOf(1, 2, 3, 255), SIZE)
    const second = encodeIconPixelsReusing(first, pixelsOf(1, 2, 4, 255), SIZE)
    expect(second.dataUrl).not.toBe(first.dataUrl)
    expect(encodedBitmaps).toBe(2)
  })

  it('gives an empty url for an icon with nothing to draw', () => {
    const first = encodeIconPixelsReusing(null, pixelsOf(1, 2, 3, 255), SIZE)
    expect(encodeIconPixelsReusing(first, null, SIZE)).toEqual({ pixels: null, dataUrl: '' })
  })

  it('does not remember pixels it could not encode, so the next update tries again', () => {
    encodingFails = true
    const failed = encodeIconPixelsReusing(null, pixelsOf(1, 2, 3, 255), SIZE)
    expect(failed).toEqual({ pixels: null, dataUrl: '' })
    encodingFails = false
    const retried = encodeIconPixelsReusing(failed, pixelsOf(1, 2, 3, 255), SIZE)
    expect(retried.dataUrl).not.toBe('')
    expect(encodedBitmaps).toBe(2)
  })
})

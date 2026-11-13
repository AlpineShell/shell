import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  copyCovers,
  createWallpaperScaler,
  physicalDisplayArea,
  planScaledCopy,
  scaledCopyName,
  scaledWallpaperSize,
} from './wallpaperScaling.js'

const UHD = { width: 3840, height: 2160 }

function uprightJpeg(width, height) {
  const frame = Buffer.from([0xff, 0xc0, 0x00, 0x08, 0x08, 0, 0, 0, 0, 0x03])
  frame.writeUInt16BE(height, 5)
  frame.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), frame, Buffer.from([0xff, 0xda, 0x00, 0x02])])
}

function enlargementOf(target, area) {
  return Math.max(area.width / target.width, area.height / target.height)
}

function imageFacts(overrides = {}) {
  return { format: 'jpeg', width: 3840, height: 2160, hasAlpha: false, colorManaged: false, orientation: 1, animated: false, supportedComponents: true, ...overrides }
}

describe('physicalDisplayArea', () => {
  it('turns a display into its device pixels with a pixel of margin for rounding', () => {
    expect(physicalDisplayArea({ size: { width: 1440, height: 900 }, scaleFactor: 2 })).toEqual({ width: 2882, height: 1802 })
    expect(physicalDisplayArea({ size: { width: 1463, height: 823 }, scaleFactor: 1.75 })).toEqual({ width: 2562, height: 1442 })
  })
})

describe('scaledWallpaperSize', () => {
  it('shrinks a UHD image to what covers a 2880x1800 panel', () => {
    expect(scaledWallpaperSize(UHD, [{ width: 2880, height: 1800 }])).toEqual({ width: 3200, height: 1800 })
  })

  it('never shows any display the scaled copy enlarged', () => {
    const areas = [{ width: 1366, height: 768 }, { width: 1280, height: 1024 }, { width: 2560, height: 1080 }, { width: 2000, height: 1001 }]
    const target = scaledWallpaperSize(UHD, areas)

    for (const area of areas) expect(enlargementOf(target, area)).toBeLessThanOrEqual(1)
  })

  it('leaves an image alone that a display needs at full size or more', () => {
    expect(scaledWallpaperSize(UHD, [{ width: 3840, height: 2160 }])).toBeNull()
    expect(scaledWallpaperSize(UHD, [{ width: 5120, height: 2880 }])).toBeNull()
    expect(scaledWallpaperSize(UHD, [{ width: 1800, height: 2880 }])).toBeNull()
  })

  it('leaves an image alone that is only a little larger than needed', () => {
    expect(scaledWallpaperSize(UHD, [{ width: 3600, height: 2000 }])).toBeNull()
  })

  it('leaves an image alone when no display is known', () => {
    expect(scaledWallpaperSize(UHD, [])).toBeNull()
  })
})

describe('copyCovers', () => {
  const copy = { image: UHD, target: { width: 3200, height: 1800 } }

  it('accepts the displays the copy was made for', () => {
    expect(copyCovers(copy, [{ width: 2880, height: 1800 }])).toBe(true)
  })

  it('rejects a display that now needs more pixels, such as a rotated one', () => {
    expect(copyCovers(copy, [{ width: 1800, height: 2880 }])).toBe(false)
    expect(copyCovers(copy, [{ width: 3840, height: 2160 }])).toBe(false)
  })
})

describe('scaledCopyName', () => {
  const identity = { sourcePath: 'wallpaper.jpg', mtimeMs: 1, sizeBytes: 2, target: { width: 3200, height: 1800 }, format: 'jpeg' }

  it('names a copy after everything that decides its pixels', () => {
    expect(scaledCopyName(identity)).toBe(scaledCopyName({ ...identity }))
    expect(scaledCopyName(identity)).not.toBe(scaledCopyName({ ...identity, sourcePath: 'other.jpg' }))
    expect(scaledCopyName(identity)).not.toBe(scaledCopyName({ ...identity, mtimeMs: 3 }))
    expect(scaledCopyName(identity)).not.toBe(scaledCopyName({ ...identity, sizeBytes: 3 }))
    expect(scaledCopyName(identity)).not.toBe(scaledCopyName({ ...identity, target: { width: 3000, height: 1688 } }))
    expect(scaledCopyName(identity)).toMatch(/\.jpg$/)
    expect(scaledCopyName({ ...identity, format: 'png' })).toMatch(/\.png$/)
  })
})

describe('planScaledCopy', () => {
  const cacheDirectory = path.resolve(path.join(path.sep, 'cache'))
  const stat = { mtimeMs: 1, size: 2 }
  const areas = [{ width: 2880, height: 1800 }]

  it('keeps a transparent PNG as PNG and turns the rest into JPEG', () => {
    const transparent = imageFacts({ format: 'png', hasAlpha: true })

    expect(planScaledCopy({ sourcePath: 'a.png', stat, facts: transparent, areas, cacheDirectory }).format).toBe('png')
    expect(planScaledCopy({ sourcePath: 'a.png', stat, facts: { ...transparent, hasAlpha: false }, areas, cacheDirectory }).format).toBe('jpeg')
    expect(planScaledCopy({ sourcePath: 'a.jpg', stat, facts: imageFacts(), areas, cacheDirectory }).format).toBe('jpeg')
  })

  it('puts the copy in the cache directory', () => {
    const plan = planScaledCopy({ sourcePath: 'a.jpg', stat, facts: imageFacts(), areas, cacheDirectory })

    expect(path.dirname(plan.cachedPath)).toBe(cacheDirectory)
    expect(plan.target).toEqual({ width: 3200, height: 1800 })
  })

  it('plans nothing for an image that is unsafe to re-encode', () => {
    expect(planScaledCopy({ sourcePath: 'a.jpg', stat, facts: imageFacts({ orientation: 6 }), areas, cacheDirectory })).toBeNull()
    expect(planScaledCopy({ sourcePath: 'a.jpg', stat, facts: null, areas, cacheDirectory })).toBeNull()
  })
})

describe('createWallpaperScaler', () => {
  let workDirectory
  let cacheDirectory
  let areas

  beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-scaling-'))
    cacheDirectory = path.join(workDirectory, 'scaled')
    areas = [{ width: 2880, height: 1800 }]
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(workDirectory, { recursive: true, force: true })
  })

  function writeSource(name, contents) {
    const sourcePath = path.join(workDirectory, name)
    fs.writeFileSync(sourcePath, contents)
    return sourcePath
  }

  function scalerWith(overrides = {}) {
    return createWallpaperScaler({
      cacheDirectory,
      readDisplayAreas: () => areas,
      encodeScaledCopy: async () => Buffer.from('scaled'),
      quietDelayMs: 0,
      ...overrides,
    })
  }

  async function scaledCopyOnceReady(scaler, sourcePath) {
    let served = sourcePath
    await vi.waitFor(async () => {
      served = await scaler.servedFileFor(sourcePath)
      expect(served).not.toBe(sourcePath)
    })
    return served
  }

  it('serves the original until the scaled copy is ready, then the copy', async () => {
    const sourcePath = writeSource('large.jpg', uprightJpeg(3840, 2160))
    const encodeScaledCopy = vi.fn(async () => Buffer.from('scaled'))
    const scaler = scalerWith({ encodeScaledCopy })

    expect(await scaler.servedFileFor(sourcePath)).toBe(sourcePath)
    const served = await scaledCopyOnceReady(scaler, sourcePath)

    expect(path.dirname(served)).toBe(cacheDirectory)
    expect(fs.readFileSync(served, 'utf8')).toBe('scaled')
    expect(encodeScaledCopy).toHaveBeenCalledTimes(1)
    expect(encodeScaledCopy.mock.calls[0][0]).toMatchObject({ sourcePath, target: { width: 3200, height: 1800 }, format: 'jpeg' })
  })

  it('serves the original of an image that needs no scaling and makes no copy', async () => {
    const sourcePath = writeSource('small.jpg', uprightJpeg(2880, 1800))
    const encodeScaledCopy = vi.fn(async () => Buffer.from('scaled'))
    const scaler = scalerWith({ encodeScaledCopy })

    expect(await scaler.servedFileFor(sourcePath)).toBe(sourcePath)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(encodeScaledCopy).not.toHaveBeenCalled()
  })

  it('serves the original when the file is missing or not an image it can read', async () => {
    const missingPath = path.join(workDirectory, 'missing.jpg')
    const bitmapPath = writeSource('picture.bmp', Buffer.from('BM'))
    const scaler = scalerWith()

    expect(await scaler.servedFileFor(missingPath)).toBe(missingPath)
    expect(await scaler.servedFileFor(bitmapPath)).toBe(bitmapPath)
  })

  it('keeps serving the original when encoding fails', async () => {
    const sourcePath = writeSource('large.jpg', uprightJpeg(3840, 2160))
    const encodeScaledCopy = vi.fn(async () => { throw new Error('decode failed') })
    const scaler = scalerWith({ encodeScaledCopy })

    await scaler.servedFileFor(sourcePath)
    await vi.waitFor(() => expect(encodeScaledCopy).toHaveBeenCalled())

    expect(await scaler.servedFileFor(sourcePath)).toBe(sourcePath)
  })

  it('makes a new copy when the displays need a different size and drops the old one', async () => {
    const sourcePath = writeSource('large.jpg', uprightJpeg(3840, 2160))
    const scaler = scalerWith()
    await scaler.servedFileFor(sourcePath)
    const firstCopy = await scaledCopyOnceReady(scaler, sourcePath)

    areas = [{ width: 1920, height: 1080 }]
    const secondCopy = await scaledCopyOnceReady(scaler, sourcePath)

    expect(secondCopy).not.toBe(firstCopy)
    expect(fs.existsSync(firstCopy)).toBe(false)
  })

  it('asks for a reload when a display outgrows the copy it was served', async () => {
    const sourcePath = writeSource('large.jpg', uprightJpeg(3840, 2160))
    const onServedCopyOutgrown = vi.fn()
    const scaler = scalerWith({ onServedCopyOutgrown })
    await scaler.servedFileFor(sourcePath)
    await scaledCopyOnceReady(scaler, sourcePath)

    scaler.handleDisplaysChanged()
    expect(onServedCopyOutgrown).not.toHaveBeenCalled()

    areas = [{ width: 1800, height: 2880 }]
    scaler.handleDisplaysChanged()
    expect(onServedCopyOutgrown).toHaveBeenCalledTimes(1)
  })

  it('never asks for a reload while only originals were served', async () => {
    const sourcePath = writeSource('small.jpg', uprightJpeg(1920, 1080))
    const onServedCopyOutgrown = vi.fn()
    const scaler = scalerWith({ onServedCopyOutgrown })
    await scaler.servedFileFor(sourcePath)

    areas = [{ width: 3840, height: 2160 }]
    scaler.handleDisplaysChanged()

    expect(onServedCopyOutgrown).not.toHaveBeenCalled()
  })
})

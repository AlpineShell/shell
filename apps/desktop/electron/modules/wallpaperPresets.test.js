import path from 'path'
import { describe, expect, it } from 'vitest'
import wallpaperPresets from './wallpaperPresets.js'

const { isWallpaperFile, isInsideDirectory, removedPresetReplacement } = wallpaperPresets

const PRESETS_DIR = path.resolve(path.join(path.sep, 'Alpine Shell', 'resources', 'wallpapers'))
const MINE_DIR = path.resolve(path.join(path.sep, 'AppData', 'alpine-shell', 'wallpapers'))
const REMAINING_PRESETS = ['Quiet Moment In Nature.jpg', 'CREDITS.md', 'Grainy Valley.jpeg']

function nothingExists() {
  return false
}

describe('isWallpaperFile', () => {
  it('accepts the image types the presets and the picker allow, in any case', () => {
    expect(isWallpaperFile('Grainy Valley.jpeg')).toBe(true)
    expect(isWallpaperFile('photo.PNG')).toBe(true)
    expect(isWallpaperFile('art.webp')).toBe(true)
  })

  it('skips everything else in the folder', () => {
    expect(isWallpaperFile('CREDITS.md')).toBe(false)
    expect(isWallpaperFile('desktop.ini')).toBe(false)
  })
})

describe('isInsideDirectory', () => {
  it('accepts a file in the folder whatever its case', () => {
    expect(isInsideDirectory(path.join(PRESETS_DIR, 'Midnight Windows.jpg'), PRESETS_DIR)).toBe(true)
    expect(isInsideDirectory(path.join(PRESETS_DIR, 'Midnight Windows.jpg'), PRESETS_DIR.toUpperCase())).toBe(true)
  })

  it('rejects the folder itself, its parent and a sibling folder', () => {
    expect(isInsideDirectory(PRESETS_DIR, PRESETS_DIR)).toBe(false)
    expect(isInsideDirectory(path.join(PRESETS_DIR, '..', 'app.asar'), PRESETS_DIR)).toBe(false)
    expect(isInsideDirectory(`${PRESETS_DIR}-old${path.sep}Midnight Windows.jpg`, PRESETS_DIR)).toBe(false)
  })
})

describe('removedPresetReplacement', () => {
  it('moves a desktop whose preset was removed by an update to the first remaining preset', () => {
    expect(removedPresetReplacement({
      wallpaperPath: path.join(PRESETS_DIR, 'Midnight Windows.jpg'),
      presetsDir: PRESETS_DIR,
      presetNames: REMAINING_PRESETS,
      exists: nothingExists,
    })).toBe(path.join(PRESETS_DIR, 'Grainy Valley.jpeg'))
  })

  it('keeps a wallpaper that still exists', () => {
    expect(removedPresetReplacement({
      wallpaperPath: path.join(PRESETS_DIR, 'Grainy Valley.jpeg'),
      presetsDir: PRESETS_DIR,
      presetNames: REMAINING_PRESETS,
      exists: () => true,
    })).toBeNull()
  })

  it('never replaces a missing wallpaper the user chose from outside the presets', () => {
    expect(removedPresetReplacement({
      wallpaperPath: path.join(MINE_DIR, 'holiday.jpg'),
      presetsDir: PRESETS_DIR,
      presetNames: REMAINING_PRESETS,
      exists: nothingExists,
    })).toBeNull()
  })

  it('does nothing without a wallpaper path or without a remaining preset', () => {
    expect(removedPresetReplacement({
      wallpaperPath: null,
      presetsDir: PRESETS_DIR,
      presetNames: REMAINING_PRESETS,
      exists: nothingExists,
    })).toBeNull()
    expect(removedPresetReplacement({
      wallpaperPath: path.join(PRESETS_DIR, 'Midnight Windows.jpg'),
      presetsDir: PRESETS_DIR,
      presetNames: ['CREDITS.md'],
      exists: nothingExists,
    })).toBeNull()
  })
})

import path from 'path'
import { describe, expect, it } from 'vitest'
import wallpaperPresets from './wallpaperPresets.js'

const { isWallpaperFile, isInsideDirectory, remapMovedPreset, removedPresetReplacement } = wallpaperPresets

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

describe('remapMovedPreset', () => {
  it('remaps a preset saved under an earlier version directory to the active presets folder', () => {
    const oldPresetsDir = path.resolve(path.join(path.sep, 'Programs', 'alpine-shell', 'versions', '1.0.0', 'resources', 'wallpapers'))
    const newPresetsDir = path.resolve(path.join(path.sep, 'Programs', 'alpine-shell', 'versions', '1.0.1', 'resources', 'wallpapers'))
    const target = path.join(newPresetsDir, 'Grainy Valley.jpeg')

    expect(remapMovedPreset({
      wallpaperPath: path.join(oldPresetsDir, 'Grainy Valley.jpeg'),
      presetsDir: newPresetsDir,
      exists: (candidate) => candidate === target,
    })).toBe(target)
  })

  it('leaves user wallpapers outside resources/wallpapers untouched', () => {
    expect(remapMovedPreset({
      wallpaperPath: path.join(MINE_DIR, 'Grainy Valley.jpeg'),
      presetsDir: PRESETS_DIR,
      exists: () => true,
    })).toBeNull()
  })
})

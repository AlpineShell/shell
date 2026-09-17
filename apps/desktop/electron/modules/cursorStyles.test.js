import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'
import cursorStyles from './cursorStyles.js'

const { CURSOR_STYLES, DEFAULT_CURSOR_STYLE, CURSOR_REGISTRY_MAP, cursorStyleOrDefault } = cursorStyles

const BUNDLED_CURSORS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'cursor')

describe('cursor styles', () => {
  it('defaults to the rounded white Bibata cursor', () => {
    expect(DEFAULT_CURSOR_STYLE).toBe('Bibata-Modern-Ice')
    expect(CURSOR_STYLES).toContain(DEFAULT_CURSOR_STYLE)
  })

  it('keeps a style it offers', () => {
    expect(cursorStyleOrDefault('Bibata-Original-Amber')).toBe('Bibata-Original-Amber')
  })

  it('falls back to the default for a style it does not offer, so no other folder is ever read', () => {
    expect(cursorStyleOrDefault(undefined)).toBe(DEFAULT_CURSOR_STYLE)
    expect(cursorStyleOrDefault('Bibata-Modern-Pink')).toBe(DEFAULT_CURSOR_STYLE)
    expect(cursorStyleOrDefault(path.join('..', '..', 'Windows'))).toBe(DEFAULT_CURSOR_STYLE)
  })

  it.each(CURSOR_STYLES)('bundles every cursor file the installer registers for %s', (style) => {
    const missing = Object.values(CURSOR_REGISTRY_MAP).filter((file) => !fs.existsSync(path.join(BUNDLED_CURSORS, style, file)))
    expect(missing).toEqual([])
  })

  it.each(CURSOR_STYLES)('bundles the license beside %s', (style) => {
    expect(fs.existsSync(path.join(BUNDLED_CURSORS, style, 'LICENSE'))).toBe(true)
  })
})

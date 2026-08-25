import { describe, it, expect } from 'vitest'
import theme from './theme.js'

describe('resolveThemeName', () => {
  it('maps the native dark flag to the dark theme', () => {
    expect(theme.resolveThemeName(true)).toBe('dark')
  })

  it('maps the native light flag to the light theme', () => {
    expect(theme.resolveThemeName(false)).toBe('light')
  })
})

describe('windowBackgroundFor', () => {
  it('gives each theme its own chrome colour', () => {
    expect(theme.windowBackgroundFor('light')).toBe('#f9fafb')
    expect(theme.windowBackgroundFor('dark')).toBe('#1a1a19')
  })

  it('falls back to the dark chrome colour for an unknown theme', () => {
    expect(theme.windowBackgroundFor('sepia')).toBe('#1a1a19')
  })
})

describe('getTheme', () => {
  it('pairs the resolved name with its window background when electron is unavailable', () => {
    expect(theme.getTheme()).toEqual({ name: 'dark', background: '#1a1a19' })
  })
})

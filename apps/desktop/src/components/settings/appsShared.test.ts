import { describe, it, expect } from 'vitest'
import { processKey, bandLabel, bandTone } from './appsShared'

describe('processKey', () => {
  it('returns null for nullish or empty targets', () => {
    expect(processKey(null)).toBeNull()
    expect(processKey('')).toBeNull()
  })

  it('extracts the lowercased basename from a Windows path', () => {
    expect(processKey('C:\\Program Files\\Chrome\\chrome.exe')).toBe('chrome')
  })

  it('handles POSIX separators', () => {
    expect(processKey('/usr/bin/bash')).toBe('bash')
  })

  it('strips only the final extension', () => {
    expect(processKey('file.name.with.dots.exe')).toBe('file.name.with.dots')
  })

  it('lowercases the result', () => {
    expect(processKey('UPPERCASE.EXE')).toBe('uppercase')
  })

  it('leaves a name without an extension intact', () => {
    expect(processKey('noextension')).toBe('noextension')
  })
})

describe('bandLabel', () => {
  it('maps each band to its capitalized label', () => {
    expect(bandLabel('light')).toBe('Light')
    expect(bandLabel('moderate')).toBe('Moderate')
    expect(bandLabel('heavy')).toBe('Heavy')
  })
})

describe('bandTone', () => {
  it('highlights only the heavy band', () => {
    expect(bandTone('heavy')).toBe('warning')
    expect(bandTone('light')).toBe('neutral')
    expect(bandTone('moderate')).toBe('neutral')
  })
})

import { describe, it, expect } from 'vitest'
import { formatMemory, processKey } from './appsShared'

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

describe('formatMemory', () => {
  it('shows whole megabytes below a gigabyte', () => {
    expect(formatMemory(412 * 1024 ** 2)).toBe('412 MB')
  })

  it('never shows zero megabytes for a running app', () => {
    expect(formatMemory(1024)).toBe('1 MB')
  })

  it('shows gigabytes with one decimal from a gigabyte up', () => {
    expect(formatMemory(1.25 * 1024 ** 3)).toBe('1.3 GB')
  })
})

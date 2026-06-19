import { describe, it, expect } from 'vitest'
import { isWellFormedKey, normalizeKey, LICENSE_KEY_PATTERN } from './index'

describe('isWellFormedKey', () => {
  it('accepts a canonical key', () => {
    expect(isWellFormedKey('ALP-AB12-CD34-EF56-GH78')).toBe(true)
  })

  it('accepts lowercase input with surrounding whitespace', () => {
    expect(isWellFormedKey('  alp-ab12-cd34-ef56-gh78  ')).toBe(true)
  })

  it('rejects a key without the ALP prefix', () => {
    expect(isWellFormedKey('XXX-AB12-CD34-EF56-GH78')).toBe(false)
  })

  it('rejects a group of the wrong length', () => {
    expect(isWellFormedKey('ALP-AB1-CD34-EF56-GH78')).toBe(false)
  })

  it('rejects too few groups', () => {
    expect(isWellFormedKey('ALP-AB12-CD34-EF56')).toBe(false)
  })

  it('rejects non-alphanumeric characters', () => {
    expect(isWellFormedKey('ALP-AB12-CD34-EF56-GH7!')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isWellFormedKey('')).toBe(false)
  })
})

describe('normalizeKey', () => {
  it('uppercases and trims', () => {
    expect(normalizeKey('  alp-ab12-cd34-ef56-gh78 ')).toBe('ALP-AB12-CD34-EF56-GH78')
  })

  it('is idempotent', () => {
    const once = normalizeKey('alp-ab12-cd34-ef56-gh78')
    expect(normalizeKey(once)).toBe(once)
  })
})

describe('LICENSE_KEY_PATTERN', () => {
  it('matches a normalized key', () => {
    expect(LICENSE_KEY_PATTERN.test(normalizeKey('alp-ab12-cd34-ef56-gh78'))).toBe(true)
  })
})

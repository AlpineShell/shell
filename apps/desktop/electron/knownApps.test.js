import { describe, it, expect } from 'vitest'
import knownApps from './knownApps.js'

const entries = Object.entries(knownApps)

describe('knownApps', () => {
  it('keys are lowercase .exe process names', () => {
    for (const key of Object.keys(knownApps)) {
      expect(key).toBe(key.toLowerCase())
      expect(key.endsWith('.exe')).toBe(true)
    }
  })

  it('every entry has a non-empty name and blurb', () => {
    for (const [key, value] of entries) {
      expect(value.name, key).toBeTruthy()
      expect(value.blurb, key).toBeTruthy()
    }
  })

  it('every category is one of the known values', () => {
    const allowed = new Set(['app', 'system', 'unknown'])
    for (const [key, value] of entries) {
      expect(allowed.has(value.category), `${key} -> ${value.category}`).toBe(true)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MARKETPLACE_CATEGORIES,
  satisfiesRange,
  isSupportedApiVersion,
} from './constants'
import { PLUGIN_MANIFEST_FIELDS } from './manifest'
import { isHttpsOrigin, isSemver, isValidId, normalizeRelPath, validateManifestShape } from './validate'

describe('satisfiesRange', () => {
  it('handles caret, tilde, comparators, exact, wildcard', () => {
    expect(satisfiesRange('0.2.5', '^0.2.0')).toBe(true)
    expect(satisfiesRange('0.3.0', '^0.2.0')).toBe(false)
    expect(satisfiesRange('1.4.0', '^1.2.0')).toBe(true)
    expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false)
    expect(satisfiesRange('1.2.9', '~1.2.0')).toBe(true)
    expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false)
    expect(satisfiesRange('1.2.3', '>=1.0.0')).toBe(true)
    expect(satisfiesRange('0.9.0', '>=1.0.0')).toBe(false)
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true)
    expect(satisfiesRange('9.9.9', '*')).toBe(true)
    expect(satisfiesRange('9.9.9', '')).toBe(true)
  })
})

describe('isHttpsOrigin', () => {
  it('accepts https origins and *.host wildcards', () => {
    expect(isHttpsOrigin('https://api.open-meteo.com')).toBe(true)
    expect(isHttpsOrigin('https://*.example.com')).toBe(true)
  })
  it('rejects cleartext, paths, bare wildcards', () => {
    expect(isHttpsOrigin('http://example.com')).toBe(false)
    expect(isHttpsOrigin('https://example.com/path')).toBe(false)
    expect(isHttpsOrigin('*')).toBe(false)
    expect(isHttpsOrigin('https://')).toBe(false)
  })
})

describe('validators', () => {
  it('isSemver / isValidId / normalizeRelPath', () => {
    expect(isSemver('1.2.3')).toBe(true)
    expect(isSemver('1.2')).toBe(false)
    expect(isValidId('com.example.weather')).toBe(true)
    expect(isValidId('weather')).toBe(false)
    expect(normalizeRelPath('dist/renderer.js')).toBe('dist/renderer.js')
    expect(normalizeRelPath('../escape.js')).toBe(null)
    expect(normalizeRelPath('/abs.js')).toBe(null)
  })
  it('validateManifestShape flags problems', () => {
    const bad = validateManifestShape({ id: 'weather', name: '', version: '1.2', apiVersion: 99 })
    expect(bad.ok).toBe(false)
  })
  it('isSupportedApiVersion', () => {
    expect(isSupportedApiVersion(1)).toBe(true)
    expect(isSupportedApiVersion(99)).toBe(false)
  })
})

describe('schema/constants parity (anti-drift)', () => {
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schema/plugin-v1.json', import.meta.url)), 'utf8'))
  it('category enum equals MARKETPLACE_CATEGORIES', () => {
    expect(schema.properties.marketplace.properties.category.enum).toEqual([...MARKETPLACE_CATEGORIES])
  })
  it('top-level properties equal PLUGIN_MANIFEST_FIELDS', () => {
    expect(Object.keys(schema.properties)).toEqual([...PLUGIN_MANIFEST_FIELDS])
  })
})

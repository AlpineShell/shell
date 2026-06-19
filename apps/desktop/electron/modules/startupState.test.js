import { describe, it, expect } from 'vitest'
import startupState from './startupState.js'

const { isApprovedDisabledByte, parseApprovedMap, isMsixStateEnabled } = startupState

describe('isApprovedDisabledByte', () => {
  it('treats the low bit as the disabled flag', () => {
    expect(isApprovedDisabledByte(0x03)).toBe(true)
    expect(isApprovedDisabledByte(0x01)).toBe(true)
    expect(isApprovedDisabledByte(0xff)).toBe(true)
    expect(isApprovedDisabledByte(0x81)).toBe(true)
  })

  it('reports enabled when the low bit is clear', () => {
    expect(isApprovedDisabledByte(0x02)).toBe(false)
    expect(isApprovedDisabledByte(0x00)).toBe(false)
  })
})

describe('parseApprovedMap', () => {
  it('maps each entry name to its disabled state', () => {
    const output = [
      '    OneDrive    REG_BINARY    030000000000000000000000',
      '    Spotify    REG_BINARY    020000000000000000000000',
    ].join('\n')
    const map = parseApprovedMap(output)
    expect(map.get('onedrive')).toBe(true)
    expect(map.get('spotify')).toBe(false)
  })

  it('lowercases entry names', () => {
    const map = parseApprovedMap('    MixedCaseApp    REG_BINARY    02ABCDEF')
    expect(map.has('mixedcaseapp')).toBe(true)
  })

  it('accepts upper- and lower-case hex equivalently', () => {
    const upper = parseApprovedMap('    app    REG_BINARY    03ff')
    const lower = parseApprovedMap('    app    REG_BINARY    03FF')
    expect(upper.get('app')).toBe(lower.get('app'))
  })

  it('skips malformed lines', () => {
    const output = [
      'no leading whitespace REG_BINARY 03',
      '    missingvalue    REG_SZ    hello',
      '    tooshort    REG_BINARY    0',
    ].join('\n')
    expect(parseApprovedMap(output).size).toBe(0)
  })

  it('returns an empty map for empty input', () => {
    expect(parseApprovedMap('').size).toBe(0)
  })
})

describe('isMsixStateEnabled', () => {
  it('counts only states 2 and 4 as enabled', () => {
    expect(isMsixStateEnabled(2)).toBe(true)
    expect(isMsixStateEnabled(4)).toBe(true)
  })

  it('treats other states as disabled', () => {
    for (const state of [0, 1, 3, 99]) {
      expect(isMsixStateEnabled(state)).toBe(false)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const { parseRegistryValues } = nodeRequire('./registryRead.js')

describe('parseRegistryValues', () => {
  it('reads every value of a reg query listing, including names and data with spaces', () => {
    const output = [
      '',
      'HKEY_CURRENT_USER\\Control Panel\\Cursors',
      '    (Default)    REG_SZ    Alpine Shell',
      '    Arrow    REG_EXPAND_SZ    %SystemRoot%\\cursors\\aero_arrow.cur',
      '    Hand    REG_SZ    C:\\Users\\some one\\AppData\\Local\\Microsoft\\Windows\\Cursors\\Alpine Shell\\Link.cur',
      '    Help    REG_SZ    ',
      '    Scheme Source    REG_DWORD    0x2',
      '',
    ].join('\r\n')

    expect(parseRegistryValues(output)).toEqual([
      { name: '(Default)', data: 'Alpine Shell' },
      { name: 'Arrow', data: '%SystemRoot%\\cursors\\aero_arrow.cur' },
      { name: 'Hand', data: 'C:\\Users\\some one\\AppData\\Local\\Microsoft\\Windows\\Cursors\\Alpine Shell\\Link.cur' },
      { name: 'Help', data: '' },
      { name: 'Scheme Source', data: '0x2' },
    ])
  })

  it('returns nothing for an empty listing', () => {
    expect(parseRegistryValues('')).toEqual([])
  })
})

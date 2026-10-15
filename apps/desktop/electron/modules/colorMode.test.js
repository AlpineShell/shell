import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const { toColorMode, colorModeFromLightThemeFlag, writeColorModeCommand } = nodeRequire('./colorMode.js')

describe('colorModeFromLightThemeFlag', () => {
  it.each([
    ['0', 'dark'],
    ['1', 'light'],
    [' 0\r\n', 'dark'],
  ])('reads %j as %s', (output, mode) => {
    expect(colorModeFromLightThemeFlag(output)).toBe(mode)
  })

  it('falls back to the Windows default when the value has never been written', () => {
    expect(colorModeFromLightThemeFlag('')).toBe('light')
  })
})

describe('toColorMode', () => {
  it.each([['light'], ['dark']])('accepts %s', (mode) => {
    expect(toColorMode(mode)).toBe(mode)
  })

  it.each([['Dark'], [''], [0], [null], [undefined], [{ mode: 'dark' }]])('refuses %j', (value) => {
    expect(toColorMode(value)).toBeNull()
  })
})

describe('writeColorModeCommand', () => {
  it('turns both the apps and the system flag off for dark', () => {
    const command = writeColorModeCommand('dark')
    expect(command).toContain('-Name AppsUseLightTheme -Value 0 -Type DWord')
    expect(command).toContain('-Name SystemUsesLightTheme -Value 0 -Type DWord')
  })

  it('turns both flags on for light', () => {
    const command = writeColorModeCommand('light')
    expect(command).toContain('-Name AppsUseLightTheme -Value 1 -Type DWord')
    expect(command).toContain('-Name SystemUsesLightTheme -Value 1 -Type DWord')
  })

  it('never recreates an existing key, which would wipe its other values', () => {
    expect(writeColorModeCommand('dark')).not.toContain('-Force')
  })

  it('has no double quote that would end the command line it runs inside', () => {
    expect(writeColorModeCommand('dark')).not.toContain('"')
  })
})

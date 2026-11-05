import { describe, expect, it } from 'vitest'
import { SWITCHING_PROBE_COMMAND, parseSwitchingProbe } from './wifiSwitching.js'

describe('parseSwitchingProbe', () => {
  it('reads switching as on when the firmware setting is enabled and the service runs', () => {
    expect(parseSwitchingProbe('{"bios":"Enable","service":"Running"}')).toBe(true)
  })

  it('accepts Enabled as the firmware value', () => {
    expect(parseSwitchingProbe('{"bios":"Enabled","service":"Running"}')).toBe(true)
  })

  it('reads switching as off when the firmware setting is disabled', () => {
    expect(parseSwitchingProbe('{"bios":"Disable","service":"Running"}')).toBe(false)
  })

  it('reads switching as off when the service is stopped', () => {
    expect(parseSwitchingProbe('{"bios":"Enable","service":"Stopped"}')).toBe(false)
  })

  it('reads switching as off on a PC without the HP setting or service', () => {
    expect(parseSwitchingProbe('{"bios":null,"service":null}')).toBe(false)
  })

  it('reads switching as off for empty or invalid output', () => {
    expect(parseSwitchingProbe('')).toBe(false)
    expect(parseSwitchingProbe('not json')).toBe(false)
    expect(parseSwitchingProbe('null')).toBe(false)
  })
})

describe('SWITCHING_PROBE_COMMAND', () => {
  it('contains no double quote, which would end the quoted PowerShell command', () => {
    expect(SWITCHING_PROBE_COMMAND).not.toContain('"')
  })
})

import { describe, it, expect } from 'vitest'
import dateTimeCommands from './dateTimeCommands.js'
import powershell from '../powershell.js'

const { EMPTY_STATE, parseDateTimeState, isOfferedTimeZone, autoTimeZoneScript, autoTimeScript, syncNowScript } = dateTimeCommands
const { elevatedLauncherCommand, elevatedOutcome } = powershell

const BERLIN = { id: 'W. Europe Standard Time', label: '(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna' }
const TOKYO = { id: 'Tokyo Standard Time', label: '(UTC+09:00) Osaka, Sapporo, Tokyo' }

function stateOutput(overrides) {
  return JSON.stringify({ timeZoneId: BERLIN.id, timeZones: [BERLIN, TOKYO], autoTimeZoneStart: 4, timeSyncType: 'NTP', ...overrides })
}

describe('parseDateTimeState', () => {
  it('reads the current zone, the offered zones and both automatic switches', () => {
    expect(parseDateTimeState(stateOutput())).toEqual({ timeZoneId: BERLIN.id, timeZones: [BERLIN, TOKYO], autoTimeZone: false, autoTime: true })
  })

  it('reads automatic time zone as on when its service starts on demand', () => {
    expect(parseDateTimeState(stateOutput({ autoTimeZoneStart: 3 })).autoTimeZone).toBe(true)
  })

  it('reads automatic time as off when Windows time sync is NoSync', () => {
    expect(parseDateTimeState(stateOutput({ timeSyncType: 'NoSync' })).autoTime).toBe(false)
  })

  it('leaves a switch unknown when Windows has no value for it, so the page can hide it', () => {
    const state = parseDateTimeState(stateOutput({ autoTimeZoneStart: null, timeSyncType: null }))
    expect(state.autoTimeZone).toBeNull()
    expect(state.autoTime).toBeNull()
  })

  it('drops zone entries that are not an id and a label', () => {
    expect(parseDateTimeState(stateOutput({ timeZones: [BERLIN, { id: '' }, 'Tokyo', null] })).timeZones).toEqual([BERLIN])
  })

  it('falls back to an empty state when PowerShell printed nothing usable', () => {
    expect(parseDateTimeState('')).toEqual(EMPTY_STATE)
    expect(parseDateTimeState('null')).toEqual(EMPTY_STATE)
  })
})

describe('isOfferedTimeZone', () => {
  it('accepts only a zone Windows listed', () => {
    const state = parseDateTimeState(stateOutput())
    expect(isOfferedTimeZone(state, TOKYO.id)).toBe(true)
    expect(isOfferedTimeZone(state, 'Tokyo Standard Time" & calc')).toBe(false)
    expect(isOfferedTimeZone(state, 42)).toBe(false)
  })
})

describe('elevated scripts', () => {
  it('starts the time zone service on demand when automatic time zone turns on, and disables it when it turns off', () => {
    expect(autoTimeZoneScript(true)).toContain('-Name Start -Value 3')
    expect(autoTimeZoneScript(true)).toContain('Start-Service tzautoupdate')
    expect(autoTimeZoneScript(false)).toContain('-Name Start -Value 4')
    expect(autoTimeZoneScript(false)).not.toContain('Start-Service')
  })

  it('turns automatic time on with NTP, or the domain hierarchy on a domain PC, and resyncs', () => {
    const script = autoTimeScript(true)
    expect(script).toContain("'NT5DS' } else { 'NTP' }")
    expect(script).toContain('w32tm /resync')
  })

  it('turns automatic time off with NoSync', () => {
    expect(autoTimeScript(false)).toContain("-Name Type -Value 'NoSync'")
    expect(autoTimeScript(false)).not.toContain('/resync')
  })

  it('stops on the first error so a failed step reports failure', () => {
    for (const script of [autoTimeZoneScript(true), autoTimeScript(true), syncNowScript()]) {
      expect(script.startsWith("$ErrorActionPreference = 'Stop'")).toBe(true)
    }
  })
})

describe('elevated launcher', () => {
  it('passes the script encoded, never inline, so quotes in it cannot break the command', () => {
    const command = elevatedLauncherCommand("Write-Output 'it''s'")
    expect(command).toContain('-Verb RunAs')
    expect(command).toContain(Buffer.from("Write-Output 'it''s'", 'utf16le').toString('base64'))
    expect(command).not.toContain('Write-Output')
  })

  it('tells a declined prompt apart from a failed change', () => {
    expect(elevatedOutcome(0)).toEqual({ ok: true, declined: false })
    expect(elevatedOutcome(1223)).toEqual({ ok: false, declined: true })
    expect(elevatedOutcome(1)).toEqual({ ok: false, declined: false })
  })
})

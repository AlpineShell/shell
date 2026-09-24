import { afterEach, describe, expect, it } from 'vitest'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')

const WHOAMI_OUTPUT = 'S-1-5-5-0-43222286\r\n'
const calls = []
let whoami = () => WHOAMI_OUTPUT

childProcess.execFileSync = (file, args, options) => {
  calls.push({ file, args, options })
  return whoami()
}

const { default: logonSession } = await import('./logonSession.js')

afterEach(() => {
  calls.length = 0
  whoami = () => WHOAMI_OUTPUT
})

describe('parseLogonId', () => {
  it('reads the logon SID from what whoami prints', () => {
    expect(logonSession.parseLogonId(WHOAMI_OUTPUT)).toBe('S-1-5-5-0-43222286')
  })

  it('finds the logon SID inside other text', () => {
    expect(logonSession.parseLogonId('Logon ID: S-1-5-5-0-43222286 (current)')).toBe('S-1-5-5-0-43222286')
  })

  it('reads nothing from an empty or missing value', () => {
    expect(logonSession.parseLogonId('')).toBe(null)
    expect(logonSession.parseLogonId(null)).toBe(null)
    expect(logonSession.parseLogonId(undefined)).toBe(null)
  })

  it('reads nothing from a hand-off marker an older version wrote', () => {
    expect(logonSession.parseLogonId('2026-09-24T10:47:00.000Z')).toBe(null)
  })

  it('does not mistake the user SID for the logon SID', () => {
    expect(logonSession.parseLogonId('S-1-5-21-1004336348-1177238915-682003330-1001')).toBe(null)
  })
})

describe('currentLogonId', () => {
  it('asks the Windows whoami for the logon SID without showing a window', () => {
    expect(logonSession.currentLogonId()).toBe('S-1-5-5-0-43222286')
    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe(logonSession.whoamiPath())
    expect(path.basename(calls[0].file)).toBe('whoami.exe')
    expect(calls[0].args).toEqual(['/logonid'])
    expect(calls[0].options).toMatchObject({ windowsHide: true })
    expect(calls[0].options.timeout).toBeGreaterThan(0)
  })

  it('reports an unknown sign-in when whoami fails', () => {
    whoami = () => { throw new Error('blocked') }
    expect(logonSession.currentLogonId()).toBe(null)
  })

  it('reports an unknown sign-in when whoami prints something else', () => {
    whoami = () => 'extra operand /logonid\n'
    expect(logonSession.currentLogonId()).toBe(null)
  })
})

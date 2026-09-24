import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')
const { parseLogonId } = nodeRequire('../logonSession.js')

const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const THIS_SIGN_IN = 'S-1-5-5-0-43222286'
const EARLIER_SIGN_IN = 'S-1-5-5-0-41000007'
const HOUR_MS = 60 * 60 * 1000

const registry = new Map()
let userDataDir = ''
let tempDir = ''
let previousTemp

const electronApp = { getPath: () => userDataDir, isPackaged: false }
const logonSessionMock = { parseLogonId, currentLogonId: vi.fn(() => THIS_SIGN_IN) }

function registryKey(keyPath, valueName) {
  return `${keyPath}\\${valueName}`
}

function inject(moduleId, exports) {
  nodeRequire.cache[moduleId] = { id: moduleId, filename: moduleId, loaded: true, exports }
}

inject(nodeRequire.resolve('electron'), { app: electronApp })
inject(nodeRequire.resolve('../logonSession.js'), logonSessionMock)
inject(nodeRequire.resolve('../registryRead.js'), { regQuery: (keyPath, valueName) => registry.get(registryKey(keyPath, valueName)) ?? null })

childProcess.execFileSync = (file, args) => {
  if (file === 'reg' && args[0] === 'add') registry.set(registryKey(args[1], args[3]), args[7])
  if (file === 'reg' && args[0] === 'delete') registry.delete(registryKey(args[1], args[3]))
  return ''
}
childProcess.spawn = () => ({ pid: 4242, on: () => {}, unref: () => {} })

const { default: installer } = await import('./installer.js')

const handoffMarkerPath = () => path.join(userDataDir, '.shell-handoff')

function writeHandoffMarker(content, ageMs = 0) {
  fs.writeFileSync(handoffMarkerPath(), content)
  const stamped = new Date(Date.now() - ageMs)
  fs.utimesSync(handoffMarkerPath(), stamped, stamped)
}

beforeEach(() => {
  registry.clear()
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-installer-'))
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-installer-temp-'))
  previousTemp = process.env.TEMP
  process.env.TEMP = tempDir
  logonSessionMock.currentLogonId.mockReset()
  logonSessionMock.currentLogonId.mockImplementation(() => THIS_SIGN_IN)
  vi.spyOn(os, 'uptime').mockReturnValue(10 * 60 * 60)
})

afterEach(() => {
  vi.restoreAllMocks()
  if (previousTemp === undefined) delete process.env.TEMP
  else process.env.TEMP = previousTemp
  fs.rmSync(userDataDir, { recursive: true, force: true })
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('the temporary revert', () => {
  it('records the sign-in it hands the shell to Explorer for', () => {
    const result = installer.revertShellTemporarily()

    expect(result.success).toBe(true)
    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe('explorer.exe')
    expect(fs.readFileSync(handoffMarkerPath(), 'utf8')).toBe(THIS_SIGN_IN)
    expect(installer.shellHandoffFromThisLogon()).toBe(true)
  })

  it('still hands the shell to Explorer when the sign-in cannot be read', () => {
    logonSessionMock.currentLogonId.mockImplementation(() => null)

    const result = installer.revertShellTemporarily()

    expect(result.success).toBe(true)
    expect(fs.readFileSync(handoffMarkerPath(), 'utf8')).toBe('')
    expect(installer.shellHandoffFromThisLogon()).toBe(null)
    expect(installer.hasShellHandoff()).toBe(true)
  })
})

describe('shellHandoffFromThisLogon', () => {
  it('holds for the sign-in the hand-off was recorded in', () => {
    writeHandoffMarker(THIS_SIGN_IN)
    expect(installer.shellHandoffFromThisLogon()).toBe(true)
    expect(installer.hasShellHandoff()).toBe(true)
  })

  it('ends at the next sign-in', () => {
    writeHandoffMarker(EARLIER_SIGN_IN)
    expect(installer.shellHandoffFromThisLogon()).toBe(false)
    expect(installer.hasShellHandoff()).toBe(false)
  })

  it('falls back to the age of the hand-off when this sign-in cannot be read', () => {
    writeHandoffMarker(THIS_SIGN_IN)
    logonSessionMock.currentLogonId.mockImplementation(() => null)
    expect(installer.shellHandoffFromThisLogon()).toBe(null)
    expect(installer.hasShellHandoff()).toBe(true)
  })

  it('falls back to the age of a hand-off an older version recorded without its sign-in', () => {
    writeHandoffMarker('2026-09-24T10:47:00.000Z')
    expect(installer.shellHandoffFromThisLogon()).toBe(null)
    expect(installer.hasShellHandoff()).toBe(true)
  })

  it('ends with the boot the hand-off was recorded in', () => {
    writeHandoffMarker(THIS_SIGN_IN, 2 * HOUR_MS)
    os.uptime.mockReturnValue(60 * 60)
    expect(installer.shellHandoffFromThisLogon()).toBe(false)

    os.uptime.mockReturnValue(3 * 60 * 60)
    expect(installer.shellHandoffFromThisLogon()).toBe(true)
  })

  it('ends after twelve hours even within one boot', () => {
    writeHandoffMarker(THIS_SIGN_IN, 13 * HOUR_MS)
    os.uptime.mockReturnValue(20 * 60 * 60)
    expect(installer.shellHandoffFromThisLogon()).toBe(false)
  })

  it('keeps the recorded sign-in when it restamps a future-dated hand-off', () => {
    writeHandoffMarker(THIS_SIGN_IN, -HOUR_MS)
    expect(installer.shellHandoffFromThisLogon()).toBe(true)
    expect(fs.readFileSync(handoffMarkerPath(), 'utf8')).toBe(THIS_SIGN_IN)
    expect(fs.statSync(handoffMarkerPath()).mtimeMs).toBeLessThanOrEqual(Date.now())
  })

  it('does not look up the sign-in when nothing was handed over', () => {
    expect(installer.shellHandoffFromThisLogon()).toBe(false)
    expect(logonSessionMock.currentLogonId).not.toHaveBeenCalled()
  })
})

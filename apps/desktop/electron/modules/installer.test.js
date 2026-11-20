import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')
const { parseLogonId } = nodeRequire('../logonSession.js')

const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const GPU_PREFERENCES_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
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
childProcess.execSync = () => ''
const spawnMock = vi.fn()
childProcess.spawn = (...args) => spawnMock(...args)

function startedProcess() {
  return { pid: 4242, on: () => {}, unref: () => {} }
}

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
  spawnMock.mockReset()
  spawnMock.mockImplementation(startedProcess)
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

describe('the branded update hand-off', () => {
  const ALPINE_SHELL = process.execPath
  const LEAVE_SHELL_TO_EXPLORER = '--leave-shell-to-explorer'
  let resourcesDir = ''
  let installerFile = ''
  let previousResourcesPath

  function prepareUpdaterExe() {
    const scriptsDir = path.join(resourcesDir, 'scripts')
    fs.mkdirSync(scriptsDir, { recursive: true })
    const source = 'class AlpineUpdater {}'
    fs.writeFileSync(path.join(scriptsDir, 'updaterScreen.cs'), source)
    const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12)
    fs.mkdirSync(path.join(userDataDir, 'updater'), { recursive: true })
    fs.writeFileSync(path.join(userDataDir, 'updater', `AlpineUpdater-${hash}.exe`), '')
  }

  function helperArgs() {
    return spawnMock.mock.calls[0][1]
  }

  beforeEach(() => {
    electronApp.isPackaged = true
    previousResourcesPath = process.resourcesPath
    resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-installer-resources-'))
    process.resourcesPath = resourcesDir
    installerFile = path.join(tempDir, 'Alpine Shell Setup 9.9.9.exe')
    fs.writeFileSync(installerFile, '')
    prepareUpdaterExe()
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), ALPINE_SHELL)
  })

  afterEach(() => {
    electronApp.isPackaged = false
    if (previousResourcesPath === undefined) delete process.resourcesPath
    else process.resourcesPath = previousResourcesPath
    fs.rmSync(resourcesDir, { recursive: true, force: true })
  })

  it('parks the shell on Explorer while the helper installs and hands it back to Alpine afterwards', () => {
    expect(installer.startBrandedUpdate(installerFile, '9.9.9')).toBe(true)

    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe('explorer.exe')
    expect(helperArgs()).not.toContain(LEAVE_SHELL_TO_EXPLORER)
    expect(installer.isUpdateHandoffActive()).toBe(true)
  })

  it('tells the helper to leave Explorer as the shell for someone who turned Alpine off for good', () => {
    installer.setShellOptOut(true)

    expect(installer.startBrandedUpdate(installerFile, '9.9.9')).toBe(true)

    expect(helperArgs()).toContain(LEAVE_SHELL_TO_EXPLORER)
  })

  it('tells the helper to leave Explorer as the shell when Explorer was the shell before the update', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')

    expect(installer.startBrandedUpdate(installerFile, '9.9.9')).toBe(true)

    expect(helperArgs()).toContain(LEAVE_SHELL_TO_EXPLORER)
  })

  it('puts the shell back and stays open when the helper never starts', () => {
    spawnMock.mockImplementation(() => ({ pid: undefined, on: () => {}, unref: () => {} }))

    expect(installer.startBrandedUpdate(installerFile, '9.9.9')).toBe(false)

    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe(ALPINE_SHELL)
    expect(installer.isUpdateHandoffActive()).toBe(false)
  })

  it('puts the shell back when starting the helper throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    spawnMock.mockImplementation(() => { throw new Error('EACCES') })

    expect(installer.startBrandedUpdate(installerFile, '9.9.9')).toBe(false)

    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe(ALPINE_SHELL)
    expect(installer.isUpdateHandoffActive()).toBe(false)
  })
})

describe('the staged instant update swap', () => {
  const RUN_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
  const ALPINE_SHELL = process.execPath
  let stagedExe = ''

  beforeEach(() => {
    electronApp.isPackaged = true
    electronApp.getVersion = () => '1.0.0'
    stagedExe = path.join(tempDir, 'versions', '1.0.1', 'Alpine Shell.exe')
    fs.mkdirSync(path.dirname(stagedExe), { recursive: true })
    fs.writeFileSync(stagedExe, '')
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), ALPINE_SHELL)
    registry.set(registryKey(RUN_KEY, 'AlpineShell'), `"${ALPINE_SHELL}" --autostart`)
  })

  afterEach(() => {
    electronApp.isPackaged = false
    delete electronApp.getVersion
  })

  it('switches Winlogon directly to the staged exe without bouncing through Explorer and launches it with wait-pid', () => {
    const ok = installer.startStagedSwap({ targetExePath: stagedExe, targetVersion: '1.0.1' })

    expect(ok).toBe(true)
    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe(stagedExe)
    expect(registry.get(registryKey(RUN_KEY, 'AlpineShell'))).toBe(`"${stagedExe}" --autostart`)
    expect(spawnMock).toHaveBeenCalledWith(
      stagedExe,
      ['--update-swap', '--wait-pid', String(process.pid)],
      expect.objectContaining({ detached: true, cwd: path.dirname(stagedExe) })
    )
    expect(fs.existsSync(path.join(userDataDir, 'pending-swap.json'))).toBe(true)
  })

  it('leaves Explorer registered when Alpine was not the shell before the swap', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')

    expect(installer.startStagedSwap({ targetExePath: stagedExe, targetVersion: '1.0.1' })).toBe(true)
    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe('explorer.exe')
  })

  it('restores the previous shell registration and clears pending swap state when launch fails', () => {
    spawnMock.mockImplementation(() => ({ pid: undefined, on: () => {}, unref: () => {} }))

    expect(installer.startStagedSwap({ targetExePath: stagedExe, targetVersion: '1.0.1' })).toBe(false)
    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe(ALPINE_SHELL)
    expect(registry.get(registryKey(RUN_KEY, 'AlpineShell'))).toBe(`"${ALPINE_SHELL}" --autostart`)
    expect(fs.existsSync(path.join(userDataDir, 'pending-swap.json'))).toBe(false)
  })
})

describe('the startup apps sign-in record', () => {
  it('remembers that the startup apps ran in this sign-in', () => {
    installer.recordAutostartLogon()
    expect(installer.autostartRanThisLogon()).toBe(true)
  })

  it('runs them again at the next sign-in', () => {
    logonSessionMock.currentLogonId.mockImplementation(() => EARLIER_SIGN_IN)
    installer.recordAutostartLogon()

    logonSessionMock.currentLogonId.mockImplementation(() => THIS_SIGN_IN)
    expect(installer.autostartRanThisLogon()).toBe(false)
  })

  it('cannot tell when the sign-in is unknown, so the startup apps still run', () => {
    installer.recordAutostartLogon()
    logonSessionMock.currentLogonId.mockImplementation(() => null)
    expect(installer.autostartRanThisLogon()).toBe(null)
  })

  it('records nothing when the sign-in is unknown', () => {
    logonSessionMock.currentLogonId.mockImplementation(() => null)
    installer.recordAutostartLogon()
    expect(fs.existsSync(path.join(userDataDir, '.autostart-logon'))).toBe(false)
  })

  it('runs them again after a restart, even when Windows hands out the same sign-in id', () => {
    installer.recordAutostartLogon()
    const stamped = new Date(Date.now() - 2 * HOUR_MS)
    fs.utimesSync(path.join(userDataDir, '.autostart-logon'), stamped, stamped)
    os.uptime.mockReturnValue(60 * 60)
    expect(installer.autostartRanThisLogon()).toBe(false)
  })

  it('keeps the record for a sign-in that lasts for days', () => {
    installer.recordAutostartLogon()
    const stamped = new Date(Date.now() - 30 * HOUR_MS)
    fs.utimesSync(path.join(userDataDir, '.autostart-logon'), stamped, stamped)
    os.uptime.mockReturnValue(40 * 60 * 60)
    expect(installer.autostartRanThisLogon()).toBe(true)
  })
})

describe('the shell restart setting', () => {
  const HKLM_WINLOGON_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
  const autoRestartShell = () => registryKey(HKLM_WINLOGON_KEY, 'AutoRestartShell')

  it('turns shell restarts back on where an earlier version turned them off', () => {
    registry.set(autoRestartShell(), '0x0')
    installer.revertShell()
    expect(registry.get(autoRestartShell())).toBe('1')
  })

  it('leaves a shell restart setting that Alpine never turned off alone', () => {
    registry.set(autoRestartShell(), '0x1')
    installer.revertShell()
    expect(registry.get(autoRestartShell())).toBe('0x1')

    registry.delete(autoRestartShell())
    installer.revertShell()
    expect(registry.has(autoRestartShell())).toBe(false)
  })
})

describe('revertSystemChanges', () => {
  it('drops the high-performance GPU preference for the installed exe', () => {
    const previousLocalAppData = process.env.LOCALAPPDATA
    process.env.LOCALAPPDATA = tempDir
    const exePath = path.join(tempDir, 'Programs', 'alpine-shell', 'Alpine Shell.exe')
    registry.set(registryKey(GPU_PREFERENCES_KEY, exePath), 'GpuPreference=2;')

    try {
      installer.revertSystemChanges()
    } finally {
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA
      else process.env.LOCALAPPDATA = previousLocalAppData
    }

    expect(registry.has(registryKey(GPU_PREFERENCES_KEY, exePath))).toBe(false)
    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe('explorer.exe')
  })
})

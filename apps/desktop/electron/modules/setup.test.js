import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')

const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const RUN_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
const INSTALLED_EXE = path.join('C:', 'Programs', 'alpine-shell', 'Alpine Shell.exe')

const registry = new Map()
const regCalls = []
const refusedWrites = new Set()
let userDataDir = ''
const electronApp = { getPath: () => userDataDir, isPackaged: false, getVersion: () => '1.0.0', exit: vi.fn(), relaunch: vi.fn() }

function licenceRequiredError() {
  const error = new Error('licence-required')
  error.code = 'licence-required'
  return error
}

const licenceMock = {
  requireValid: vi.fn(() => ({ state: 'valid' })),
  releaseSelf: vi.fn(async () => true),
}

const installerMock = {
  setShellOptOut: vi.fn(),
  clearShellHandoff: vi.fn(),
  getInstalledExePath: () => INSTALLED_EXE,
  isPortableRun: () => false,
  isShellOptedOut: () => false,
  hasShellHandoff: () => false,
  shellHandoffFromThisLogon: vi.fn(() => false),
  isUpdateHandoffActive: () => false,
  isInstalled: () => true,
  getInstalledVersion: () => '1.0.0',
  isRevertHelperRunning: () => false,
  uninstall: vi.fn(() => ({ success: false, error: 'uninstall stubbed', leftBehind: [] })),
}

const explorerShellMock = {
  shellHostedByExplorer: vi.fn(() => true),
}

function registryKey(keyPath, valueName) {
  return `${keyPath}\\${valueName}`
}

function inject(moduleId, exports) {
  nodeRequire.cache[moduleId] = { id: moduleId, filename: moduleId, loaded: true, exports }
}

inject(nodeRequire.resolve('electron'), { app: electronApp })
inject(nodeRequire.resolve('./installer.js'), installerMock)
inject(nodeRequire.resolve('./updater.js'), { isUpdatePending: () => false })
inject(nodeRequire.resolve('./explorerShell.js'), explorerShellMock)
inject(nodeRequire.resolve('./licence.js'), licenceMock)
inject(nodeRequire.resolve('../registryRead.js'), { regQuery: (keyPath, valueName) => registry.get(registryKey(keyPath, valueName)) ?? null })

childProcess.execFileSync = (file, args) => {
  regCalls.push([file, ...args])
  if (file === 'reg' && args[0] === 'add' && refusedWrites.has(registryKey(args[1], args[3]))) throw new Error('Access is denied.')
  if (file === 'reg' && args[0] === 'add') registry.set(registryKey(args[1], args[3]), args[7])
  if (file === 'reg' && args[0] === 'delete') registry.delete(registryKey(args[1], args[3]))
  return ''
}
childProcess.execSync = () => ''

const { setTrustedWindowsAccessor } = nodeRequire('../trustedSenders.js')
const { default: setup } = await import('./setup.js')

const trustedWindow = { webContents: { id: 7 }, isDestroyed: () => false }
const strangerWindow = { webContents: { id: 8 }, isDestroyed: () => false }
const fromSetupWindow = { sender: trustedWindow.webContents }
const fromStranger = { sender: strangerWindow.webContents }

const setupCompletePath = () => path.join(userDataDir, '.setup-complete')
const shellValue = () => registry.get(registryKey(WINLOGON_KEY, 'Shell')) ?? null
const runValue = () => registry.get(registryKey(RUN_KEY, 'AlpineShell')) ?? null

beforeEach(() => {
  registry.clear()
  regCalls.length = 0
  refusedWrites.clear()
  licenceMock.requireValid.mockReset()
  licenceMock.requireValid.mockImplementation(() => ({ state: 'valid' }))
  licenceMock.releaseSelf.mockReset()
  licenceMock.releaseSelf.mockImplementation(async () => true)
  installerMock.uninstall.mockClear()
  installerMock.clearShellHandoff.mockClear()
  installerMock.shellHandoffFromThisLogon.mockReset()
  installerMock.shellHandoffFromThisLogon.mockImplementation(() => false)
  explorerShellMock.shellHostedByExplorer.mockReset()
  explorerShellMock.shellHostedByExplorer.mockImplementation(() => true)
  electronApp.isPackaged = false
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-setup-'))
  setTrustedWindowsAccessor(() => [trustedWindow])
})

afterEach(() => {
  setTrustedWindowsAccessor(null)
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('setup handlers behind the licence gate', () => {
  it('refuses to install without a licence and changes nothing on the machine', async () => {
    licenceMock.requireValid.mockImplementation(() => { throw licenceRequiredError() })

    const result = await setup.handlers['setup/install'](fromSetupWindow, { shell: true, cursor: false })

    expect(result).toMatchObject({ shell: false, startup: false, cursor: false, error: 'licence-required' })
    expect(regCalls).toHaveLength(0)
    expect(fs.existsSync(setupCompletePath())).toBe(false)
  })

  it('installs when the licence is valid, registering the shell and the Run entry', async () => {
    const result = await setup.handlers['setup/install'](fromSetupWindow, { shell: true, cursor: false })

    expect(result).toMatchObject({ shell: true, startup: true, error: null })
    expect(shellValue()).not.toBeNull()
    expect(shellValue().toLowerCase()).not.toContain('explorer.exe')
    expect(runValue()).not.toBeNull()
    expect(fs.existsSync(setupCompletePath())).toBe(true)
  })

  it('refuses set-shell without a licence and registers with one', async () => {
    licenceMock.requireValid.mockImplementation(() => { throw licenceRequiredError() })
    expect(setup.handlers['setup/set-shell'](fromSetupWindow)).toEqual({ success: false, error: 'licence-required' })
    expect(shellValue()).toBeNull()

    licenceMock.requireValid.mockImplementation(() => ({ state: 'valid' }))
    expect(setup.handlers['setup/set-shell'](fromSetupWindow)).toEqual({ success: true, error: null })
    expect(shellValue()).not.toBeNull()
    expect(runValue()).not.toBeNull()
  })

  it('refuses skip without a licence and marks setup complete with one', async () => {
    licenceMock.requireValid.mockImplementation(() => { throw licenceRequiredError() })
    expect(await setup.handlers['setup/skip'](fromSetupWindow)).toEqual({ error: 'licence-required' })
    expect(fs.existsSync(setupCompletePath())).toBe(false)

    licenceMock.requireValid.mockImplementation(() => ({ state: 'valid' }))
    expect(await setup.handlers['setup/skip'](fromSetupWindow)).toEqual({ error: null })
    expect(fs.existsSync(setupCompletePath())).toBe(true)
  })

  it('lets any other error from the gate surface instead of swallowing it', async () => {
    licenceMock.requireValid.mockImplementation(() => { throw new Error('disk on fire') })
    await expect(setup.handlers['setup/install'](fromSetupWindow, { shell: true, cursor: false })).rejects.toThrow('disk on fire')
  })

  it('releases the licence seat before uninstalling, and still uninstalls when the release fails', async () => {
    electronApp.isPackaged = true
    const order = []
    licenceMock.releaseSelf.mockImplementation(async () => { order.push('release'); return true })
    installerMock.uninstall.mockImplementation(() => { order.push('uninstall'); return { success: false, error: 'stubbed', leftBehind: [] } })

    await setup.handlers['setup/uninstall'](fromSetupWindow)
    expect(order).toEqual(['release', 'uninstall'])

    licenceMock.releaseSelf.mockImplementation(async () => { throw new Error('offline') })
    await setup.handlers['setup/uninstall'](fromSetupWindow)
    expect(installerMock.uninstall).toHaveBeenCalledTimes(2)
  })

  it('does not release the licence seat when an update blocks the uninstall', async () => {
    electronApp.isPackaged = true
    const wasUpdateHandoffActive = installerMock.isUpdateHandoffActive
    installerMock.isUpdateHandoffActive = () => true
    licenceMock.releaseSelf.mockClear()
    installerMock.uninstall.mockClear()

    const result = await setup.handlers['setup/uninstall'](fromSetupWindow)

    expect(result.success).toBe(false)
    expect(licenceMock.releaseSelf).not.toHaveBeenCalled()
    expect(installerMock.uninstall).not.toHaveBeenCalled()
    installerMock.isUpdateHandoffActive = wasUpdateHandoffActive
  })
})

describe('installing when Windows does not take the shell registration', () => {
  let quietErrors

  beforeEach(() => {
    quietErrors = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    quietErrors.mockRestore()
  })

  it('reports the failure instead of setup complete and lets setup run again', async () => {
    refusedWrites.add(registryKey(WINLOGON_KEY, 'Shell'))

    const result = await setup.handlers['setup/install'](fromSetupWindow, { shell: true, cursor: false })

    expect(result.shell).toBe(false)
    expect(result.error).toBe('Could not register Alpine Shell as your desktop.')
    expect(fs.existsSync(setupCompletePath())).toBe(false)
  })

  it('completes setup when the shell is registered even though a later setting could not be written', async () => {
    refusedWrites.add(registryKey('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'EnableXamlStartMenu'))

    const result = await setup.handlers['setup/install'](fromSetupWindow, { shell: true, cursor: false })

    expect(result.shell).toBe(true)
    expect(result.error).toBeNull()
    expect(runValue()).not.toBeNull()
    expect(fs.existsSync(setupCompletePath())).toBe(true)
  })

  it('never switches off shell restarts for every account on the PC', async () => {
    await setup.handlers['setup/install'](fromSetupWindow, { shell: true, cursor: false })

    expect(regCalls.some((call) => call.some((arg) => String(arg).startsWith('HKLM')))).toBe(false)
  })
})

describe('setup handlers and their callers', () => {
  it('refuses a sender that is not the setup or settings window before touching the licence', async () => {
    expect(() => setup.handlers['setup/status'](fromStranger)).toThrow('untrusted-sender')
    await expect(async () => setup.handlers['setup/install'](fromStranger, { shell: true, cursor: false })).rejects.toThrow('untrusted-sender')
    expect(() => setup.handlers['setup/set-shell'](fromStranger)).toThrow('untrusted-sender')
    expect(licenceMock.requireValid).not.toHaveBeenCalled()
    expect(regCalls).toHaveLength(0)
  })

  it('answers the setup window', () => {
    expect(setup.handlers['setup/status'](fromSetupWindow)).toMatchObject({ isShell: false, hasStartup: false, isFirstRun: true })
  })
})

describe('the Run entry while Explorer holds the shell', () => {
  const START_MENU_LAUNCH = [INSTALLED_EXE]
  const AUTOSTART_LAUNCH = [INSTALLED_EXE, '--autostart']

  function commandLineArgs(command) {
    return [...command.matchAll(/"([^"]*)"|(\S+)/g)].map(match => match[1] ?? match[2])
  }

  function markSetupComplete() {
    fs.writeFileSync(setupCompletePath(), 'done')
  }

  function handToExplorer() {
    electronApp.isPackaged = true
    installerMock.shellHandoffFromThisLogon.mockImplementation(() => true)
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => true)
  }

  it('registers the Run entry with the autostart flag', () => {
    electronApp.isPackaged = true
    setup.handlers['setup/set-shell'](fromSetupWindow)
    expect(runValue()).toBe(`"${INSTALLED_EXE}" --autostart`)
  })

  it('rewrites a Run entry from an older version when Alpine claims the shell', () => {
    electronApp.isPackaged = true
    markSetupComplete()
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), INSTALLED_EXE)
    registry.set(registryKey(RUN_KEY, 'AlpineShell'), `"${INSTALLED_EXE}"`)

    expect(setup.takeOverFromExplorer()).toEqual({ actingAsShell: true })
    expect(runValue()).toBe(`"${INSTALLED_EXE}" --autostart`)
  })

  it('exits the launch that its own Run entry starts while Explorer holds the shell', () => {
    electronApp.isPackaged = true
    setup.handlers['setup/set-shell'](fromSetupWindow)
    handToExplorer()
    expect(setup.shouldLeaveShellToExplorer(commandLineArgs(runValue()))).toBe(true)
  })

  it('keeps a launch from the Start menu', () => {
    handToExplorer()
    expect(setup.isAutostartLaunch(START_MENU_LAUNCH)).toBe(false)
    expect(setup.shouldLeaveShellToExplorer(START_MENU_LAUNCH)).toBe(false)
  })

  it('keeps the autostart launch at a later sign-in', () => {
    handToExplorer()
    installerMock.shellHandoffFromThisLogon.mockImplementation(() => false)
    expect(setup.shouldLeaveShellToExplorer(AUTOSTART_LAUNCH)).toBe(false)
  })

  it('keeps the autostart launch when the sign-in of the hand-off cannot be read', () => {
    handToExplorer()
    installerMock.shellHandoffFromThisLogon.mockImplementation(() => null)
    expect(setup.shouldLeaveShellToExplorer(AUTOSTART_LAUNCH)).toBe(false)
  })

  it('keeps the autostart launch when Explorer cannot be confirmed as the shell', () => {
    handToExplorer()
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => null)
    expect(setup.shouldLeaveShellToExplorer(AUTOSTART_LAUNCH)).toBe(false)
  })

  it('keeps the autostart launch without probing for Explorer when nothing was handed over', () => {
    electronApp.isPackaged = true
    expect(setup.shouldLeaveShellToExplorer(AUTOSTART_LAUNCH)).toBe(false)
    expect(explorerShellMock.shellHostedByExplorer).not.toHaveBeenCalled()
  })

  it('exits the launch that its own Run entry starts while an update installs under Explorer', () => {
    electronApp.isPackaged = true
    const wasUpdateHandoffActive = installerMock.isUpdateHandoffActive
    installerMock.isUpdateHandoffActive = () => true

    expect(setup.shouldLeaveShellToExplorer(AUTOSTART_LAUNCH)).toBe(true)
    expect(setup.shouldLeaveShellToExplorer(START_MENU_LAUNCH)).toBe(false)

    installerMock.isUpdateHandoffActive = wasUpdateHandoffActive
  })

  it('leaves the registry and the hand-off alone when it exits', () => {
    handToExplorer()
    expect(setup.shouldLeaveShellToExplorer(AUTOSTART_LAUNCH)).toBe(true)
    expect(regCalls).toHaveLength(0)
    expect(installerMock.clearShellHandoff).not.toHaveBeenCalled()
  })
})

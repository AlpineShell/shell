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
  isRevertHelperRunning: vi.fn(() => false),
  restoreExplorerWhenAlpineExits: vi.fn(() => ({ pid: 1, running: true })),
  startExplorerWhenAlpineExits: vi.fn(() => ({ pid: 2, running: true })),
  uninstall: vi.fn(() => ({ success: false, error: 'uninstall stubbed', leftBehind: [] })),
}

const explorerShellMock = {
  shellHostedByExplorer: vi.fn(() => true),
  exitExplorerShell: vi.fn(() => []),
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

const { setTrustedWindowsAccessor, SETUP_WINDOW, SETTINGS_WINDOW } = nodeRequire('../trustedSenders.js')
const { default: setup } = await import('./setup.js')

const trustedWindow = { webContents: { id: 7 }, isDestroyed: () => false }
const settingsWindow = { webContents: { id: 9 }, isDestroyed: () => false }
const strangerWindow = { webContents: { id: 8 }, isDestroyed: () => false }
const fromSetupWindow = { sender: trustedWindow.webContents }
const fromSettingsWindow = { sender: settingsWindow.webContents }
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
  explorerShellMock.exitExplorerShell.mockReset()
  explorerShellMock.exitExplorerShell.mockImplementation(() => [])
  installerMock.isRevertHelperRunning.mockReset()
  installerMock.isRevertHelperRunning.mockImplementation(() => false)
  installerMock.restoreExplorerWhenAlpineExits.mockReset()
  installerMock.restoreExplorerWhenAlpineExits.mockImplementation(() => ({ pid: 1, running: true }))
  installerMock.startExplorerWhenAlpineExits.mockReset()
  installerMock.startExplorerWhenAlpineExits.mockImplementation(() => ({ pid: 2, running: true }))
  electronApp.isPackaged = false
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-setup-'))
  setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: trustedWindow, [SETTINGS_WINDOW]: settingsWindow }))
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

    await setup.handlers['setup/uninstall'](fromSettingsWindow)
    expect(order).toEqual(['release', 'uninstall'])

    licenceMock.releaseSelf.mockImplementation(async () => { throw new Error('offline') })
    await setup.handlers['setup/uninstall'](fromSettingsWindow)
    expect(installerMock.uninstall).toHaveBeenCalledTimes(2)
  })

  it('does not release the licence seat when an update blocks the uninstall', async () => {
    electronApp.isPackaged = true
    const wasUpdateHandoffActive = installerMock.isUpdateHandoffActive
    installerMock.isUpdateHandoffActive = () => true
    licenceMock.releaseSelf.mockClear()
    installerMock.uninstall.mockClear()

    const result = await setup.handlers['setup/uninstall'](fromSettingsWindow)

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

  it('keeps the install and restart channels away from the settings window', async () => {
    for (const channel of ['setup/status', 'setup/set-shell', 'setup/relaunch', 'setup/restart-windows']) {
      expect(() => setup.handlers[channel](fromSettingsWindow)).toThrow('untrusted-sender')
    }
    await expect(async () => setup.handlers['setup/install'](fromSettingsWindow, { shell: true, cursor: false })).rejects.toThrow('untrusted-sender')
    await expect(async () => setup.handlers['setup/skip'](fromSettingsWindow)).rejects.toThrow('untrusted-sender')
    expect(regCalls).toHaveLength(0)
  })

  it('answers the revert channels only from the settings window', async () => {
    for (const channel of ['setup/test-session', 'setup/end-test-session', 'setup/revert-temporary', 'setup/revert-permanent', 'setup/uninstall']) {
      await expect(async () => setup.handlers[channel](fromSetupWindow)).rejects.toThrow('untrusted-sender')
      await expect(async () => setup.handlers[channel](fromStranger)).rejects.toThrow('untrusted-sender')
    }
    expect(installerMock.uninstall).not.toHaveBeenCalled()
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

  it('never claims the Windows shell or the Run entry at startup without a licence, even with setup marked complete', () => {
    electronApp.isPackaged = true
    markSetupComplete()
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    licenceMock.requireValid.mockImplementation(() => { throw licenceRequiredError() })

    expect(setup.takeOverFromExplorer()).toEqual({ actingAsShell: false })
    expect(shellValue()).toBe('explorer.exe')
    expect(runValue()).toBeNull()
    expect(regCalls).toHaveLength(0)
  })

  it('keeps the registration of a PC that already runs Alpine as its shell when the licence is gone', () => {
    electronApp.isPackaged = true
    markSetupComplete()
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), INSTALLED_EXE)
    registry.set(registryKey(RUN_KEY, 'AlpineShell'), `"${INSTALLED_EXE}"`)
    licenceMock.requireValid.mockImplementation(() => { throw licenceRequiredError() })

    expect(setup.takeOverFromExplorer()).toEqual({ actingAsShell: true })
    expect(shellValue()).toBe(INSTALLED_EXE)
    expect(runValue()).toBe(`"${INSTALLED_EXE}" --autostart`)
  })

  it('takes the Windows shell back without a licence when a reinstall or a revert until next sign-in left Explorer there and kept the Run entry', () => {
    electronApp.isPackaged = true
    markSetupComplete()
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    registry.set(registryKey(RUN_KEY, 'AlpineShell'), `"${INSTALLED_EXE}" --autostart`)
    licenceMock.requireValid.mockImplementation(() => { throw licenceRequiredError() })

    expect(setup.takeOverFromExplorer()).toEqual({ actingAsShell: true })
    expect(shellValue()).toBe(INSTALLED_EXE)
    expect(runValue()).toBe(`"${INSTALLED_EXE}" --autostart`)
  })

  it('claims the Windows shell and the Run entry at startup with a licence', () => {
    electronApp.isPackaged = true
    markSetupComplete()
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')

    expect(setup.takeOverFromExplorer()).toEqual({ actingAsShell: true })
    expect(shellValue()).toBe(INSTALLED_EXE)
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

describe('whether Alpine has claimed the desktop', () => {
  it('counts a PC whose Winlogon Shell points at Alpine', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), INSTALLED_EXE)
    expect(setup.isDesktopClaimedByAlpine()).toBe(true)
  })

  it('counts a PC that Explorer holds only until the Run entry takes the shell back', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    registry.set(registryKey(RUN_KEY, 'AlpineShell'), `"${INSTALLED_EXE}" --autostart`)
    expect(setup.isDesktopClaimedByAlpine()).toBe(true)
  })

  it('does not count a PC with Explorer as its shell and no Run entry', () => {
    expect(setup.isDesktopClaimedByAlpine()).toBe(false)
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    expect(setup.isDesktopClaimedByAlpine()).toBe(false)
  })
})

describe('retiring Explorer for a test-out', () => {
  const EXPLORER_PROCESS_ID = 3141
  const runningProcessIds = new Set()
  const spies = []

  function freshSetup() {
    delete nodeRequire.cache[nodeRequire.resolve('./setup.js')]
    return nodeRequire('./setup.js')
  }

  function noSuchProcess() {
    const error = new Error('kill ESRCH')
    error.code = 'ESRCH'
    return error
  }

  function explorerExitsWhenAsked() {
    explorerShellMock.exitExplorerShell.mockImplementation(() => {
      runningProcessIds.delete(EXPLORER_PROCESS_ID)
      return [EXPLORER_PROCESS_ID]
    })
  }

  async function settle(promise) {
    await vi.advanceTimersByTimeAsync(15000)
    return promise
  }

  beforeEach(() => {
    vi.useFakeTimers()
    runningProcessIds.clear()
    runningProcessIds.add(EXPLORER_PROCESS_ID)
    spies.push(vi.spyOn(process, 'kill').mockImplementation((processId) => {
      if (!runningProcessIds.has(processId)) throw noSuchProcess()
      return true
    }))
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}))
    installerMock.isRevertHelperRunning.mockImplementation((helper) => Boolean(helper && helper.running))
  })

  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore())
    vi.useRealTimers()
  })

  it('leaves Explorer alone when it does not hold the desktop', async () => {
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => false)
    await expect(settle(freshSetup().beginTestSession())).resolves.toBe(false)
    expect(installerMock.restoreExplorerWhenAlpineExits).not.toHaveBeenCalled()
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('leaves Explorer alone when it cannot tell who holds the desktop', async () => {
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => null)
    await expect(settle(freshSetup().beginTestSession())).resolves.toBe(false)
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('keeps Explorer running when the helper that brings it back did not start', async () => {
    installerMock.restoreExplorerWhenAlpineExits.mockImplementation(() => null)
    await expect(settle(freshSetup().beginTestSession())).resolves.toBe(false)
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('keeps Explorer running when that helper died before Explorer was asked to leave', async () => {
    const helper = { pid: 1, running: true }
    installerMock.restoreExplorerWhenAlpineExits.mockImplementation(() => helper)
    const retirement = freshSetup().beginTestSession()
    helper.running = false
    await expect(settle(retirement)).resolves.toBe(false)
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('starts the helper first, then asks Explorer to exit, and resolves once Explorer is gone', async () => {
    explorerExitsWhenAsked()
    await expect(settle(freshSetup().beginTestSession())).resolves.toBe(true)
    expect(installerMock.restoreExplorerWhenAlpineExits.mock.invocationCallOrder[0])
      .toBeLessThan(explorerShellMock.exitExplorerShell.mock.invocationCallOrder[0])
  })

  it('waits for the Explorer process itself to end, not just for the request to be sent', async () => {
    explorerShellMock.exitExplorerShell.mockImplementation(() => [EXPLORER_PROCESS_ID])
    let resolved = false
    const retirement = freshSetup().beginTestSession().then((value) => { resolved = true; return value })
    await vi.advanceTimersByTimeAsync(3000)
    expect(resolved).toBe(false)
    runningProcessIds.delete(EXPLORER_PROCESS_ID)
    await expect(settle(retirement)).resolves.toBe(true)
  })

  it('gives up and reports Explorer still there when it does not exit in time', async () => {
    explorerShellMock.exitExplorerShell.mockImplementation(() => [EXPLORER_PROCESS_ID])
    await expect(settle(freshSetup().beginTestSession())).resolves.toBe(false)
  })

  it('reports nothing retired instead of failing the test-out when Explorer cannot be asked to leave', async () => {
    explorerShellMock.exitExplorerShell.mockImplementation(() => { throw new Error('user32 unavailable') })
    await expect(settle(freshSetup().beginTestSession())).resolves.toBe(false)
  })

  it('reports nothing retired when no Explorer window took the request', async () => {
    await expect(settle(freshSetup().beginTestSession())).resolves.toBe(false)
  })

  it('retires Explorer once even when test-out is asked for twice', async () => {
    explorerExitsWhenAsked()
    const setupModule = freshSetup()
    const first = setupModule.beginTestSession()
    const second = setupModule.beginTestSession()
    expect(second).toBe(first)
    await settle(first)
    expect(installerMock.restoreExplorerWhenAlpineExits).toHaveBeenCalledTimes(1)
    expect(explorerShellMock.exitExplorerShell).toHaveBeenCalledTimes(1)
  })
})

describe('claiming the desktop from Explorer at startup', () => {
  const EXPLORER_PROCESS_ID = 2718
  const POLICY_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'
  const spies = []
  let explorerRunning = true
  let handoffActive = false
  const originalHasShellHandoff = installerMock.hasShellHandoff

  function freshSetup() {
    delete nodeRequire.cache[nodeRequire.resolve('./setup.js')]
    return nodeRequire('./setup.js')
  }

  async function settle(promise) {
    await vi.advanceTimersByTimeAsync(15000)
    return promise
  }

  function explorerHoldsDesktopAfterSignIn() {
    electronApp.isPackaged = true
    fs.writeFileSync(setupCompletePath(), 'done')
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    registry.set(registryKey(RUN_KEY, 'AlpineShell'), `"${INSTALLED_EXE}" --autostart`)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    explorerRunning = true
    handoffActive = false
    installerMock.hasShellHandoff = vi.fn(() => handoffActive)
    installerMock.clearShellHandoff.mockImplementation(() => { handoffActive = false })
    installerMock.isRevertHelperRunning.mockImplementation((helper) => Boolean(helper && helper.running))
    explorerShellMock.exitExplorerShell.mockImplementation(() => {
      explorerRunning = false
      return [EXPLORER_PROCESS_ID]
    })
    spies.push(vi.spyOn(process, 'kill').mockImplementation((processId) => {
      if (processId === EXPLORER_PROCESS_ID && explorerRunning) return true
      const error = new Error('kill ESRCH')
      error.code = 'ESRCH'
      throw error
    }))
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}))
  })

  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore())
    installerMock.hasShellHandoff = originalHasShellHandoff
    installerMock.clearShellHandoff.mockImplementation(() => {})
    vi.useRealTimers()
  })

  it('takes the shell back and retires Explorer when a sign-in started Explorer instead of Alpine', async () => {
    explorerHoldsDesktopAfterSignIn()

    const takeover = await settle(freshSetup().claimDesktop({ launchedByHand: false }))

    expect(takeover).toEqual({ actingAsShell: true, explorerRetired: true, explorerHoldsDesktop: false, optedOut: false })
    expect(shellValue()).toBe(INSTALLED_EXE)
    expect(installerMock.restoreExplorerWhenAlpineExits.mock.invocationCallOrder[0])
      .toBeLessThan(explorerShellMock.exitExplorerShell.mock.invocationCallOrder[0])
  })

  it('ends a revert until next sign-in and retires Explorer when Alpine is started by hand', async () => {
    explorerHoldsDesktopAfterSignIn()
    handoffActive = true

    const takeover = await settle(freshSetup().claimDesktop({ launchedByHand: true }))

    expect(installerMock.clearShellHandoff).toHaveBeenCalled()
    expect(takeover).toEqual({ actingAsShell: true, explorerRetired: true, explorerHoldsDesktop: false, optedOut: false })
    expect(shellValue()).toBe(INSTALLED_EXE)
  })

  it('leaves Explorer the shell for the rest of the sign-in when the launch was not by hand', async () => {
    explorerHoldsDesktopAfterSignIn()
    handoffActive = true

    const takeover = await settle(freshSetup().claimDesktop({ launchedByHand: false }))

    expect(takeover).toEqual({ actingAsShell: false, explorerRetired: false, explorerHoldsDesktop: true, optedOut: false })
    expect(installerMock.clearShellHandoff).not.toHaveBeenCalled()
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
    expect(shellValue()).toBe('explorer.exe')
  })

  it('leaves Explorer alone when it does not hold the desktop', async () => {
    explorerHoldsDesktopAfterSignIn()
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => false)

    const takeover = await settle(freshSetup().claimDesktop({ launchedByHand: false }))

    expect(takeover).toEqual({ actingAsShell: true, explorerRetired: false, explorerHoldsDesktop: false, optedOut: false })
    expect(installerMock.restoreExplorerWhenAlpineExits).not.toHaveBeenCalled()
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('leaves Explorer alone when Group Policy sets the shell', async () => {
    explorerHoldsDesktopAfterSignIn()
    registry.set(registryKey(POLICY_KEY, 'Shell'), 'explorer.exe')

    await settle(freshSetup().claimDesktop({ launchedByHand: true }))

    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('leaves Explorer alone in development', async () => {
    explorerHoldsDesktopAfterSignIn()
    electronApp.isPackaged = false

    const takeover = await settle(freshSetup().claimDesktop({ launchedByHand: true }))

    expect(takeover.explorerRetired).toBe(false)
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('does not turn the session into a test-out', async () => {
    explorerHoldsDesktopAfterSignIn()
    const setupModule = freshSetup()

    await settle(setupModule.claimDesktop({ launchedByHand: true }))

    expect(setupModule.handlers['setup/test-session'](fromSettingsWindow)).toBe(false)
  })

  it('reports Explorer still on the desktop when it would not leave', async () => {
    explorerHoldsDesktopAfterSignIn()
    explorerShellMock.exitExplorerShell.mockImplementation(() => [])

    const takeover = await settle(freshSetup().claimDesktop({ launchedByHand: true }))

    expect(takeover).toMatchObject({ explorerRetired: false, explorerHoldsDesktop: true })
  })

  it('refuses a test-out that could not close Explorer and lets it be tried again', async () => {
    explorerShellMock.exitExplorerShell.mockImplementation(() => [])
    const setupModule = freshSetup()

    const refused = await settle(setupModule.startTestSession())

    expect(refused.error).toMatch(/did not close/)
    expect(setupModule.handlers['setup/test-session'](fromSettingsWindow)).toBe(false)

    explorerShellMock.exitExplorerShell.mockImplementation(() => {
      explorerRunning = false
      return [EXPLORER_PROCESS_ID]
    })
    await expect(settle(setupModule.startTestSession())).resolves.toEqual({ error: null, explorerRetired: true })
    expect(setupModule.handlers['setup/test-session'](fromSettingsWindow)).toBe(true)
  })

  it('starts a test-out when Explorer was not on the desktop to begin with', async () => {
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => false)
    await expect(settle(freshSetup().startTestSession())).resolves.toEqual({ error: null, explorerRetired: false })
  })

  it('retires Explorer when it shows up beside the running shell', async () => {
    const guard = await settle(freshSetup().keepExplorerOffDesktop())

    expect(guard).toEqual({ explorerRetired: true, explorerStayed: false })
    expect(installerMock.restoreExplorerWhenAlpineExits.mock.invocationCallOrder[0])
      .toBeLessThan(explorerShellMock.exitExplorerShell.mock.invocationCallOrder[0])
  })

  it('reports Explorer staying beside the running shell so Alpine can exit', async () => {
    explorerShellMock.exitExplorerShell.mockImplementation(() => [])
    await expect(settle(freshSetup().keepExplorerOffDesktop())).resolves.toEqual({ explorerRetired: false, explorerStayed: true })
  })

  it('leaves the desktop alone when Explorer is not on it', async () => {
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => false)
    await expect(settle(freshSetup().keepExplorerOffDesktop())).resolves.toEqual({ explorerRetired: false, explorerStayed: false })
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()
  })

  it('leaves Explorer alone while an update hands the desktop over', async () => {
    const wasUpdateHandoffActive = installerMock.isUpdateHandoffActive
    installerMock.isUpdateHandoffActive = () => true

    await expect(settle(freshSetup().keepExplorerOffDesktop())).resolves.toEqual({ explorerRetired: false, explorerStayed: false })
    expect(explorerShellMock.exitExplorerShell).not.toHaveBeenCalled()

    installerMock.isUpdateHandoffActive = wasUpdateHandoffActive
  })
})

describe('ending a test-out from settings', () => {
  const shellShutdown = vi.fn()
  const spies = []

  function freshSetup() {
    delete nodeRequire.cache[nodeRequire.resolve('./setup.js')]
    const setupModule = nodeRequire('./setup.js')
    setupModule.setShellShutdown(shellShutdown)
    return setupModule
  }

  async function settle(promise) {
    await vi.advanceTimersByTimeAsync(15000)
    return promise
  }

  async function testSession() {
    explorerShellMock.shellHostedByExplorer.mockImplementation(() => false)
    const setupModule = freshSetup()
    await settle(setupModule.beginTestSession())
    return setupModule
  }

  beforeEach(() => {
    vi.useFakeTimers()
    electronApp.isPackaged = true
    shellShutdown.mockReset()
    installerMock.isRevertHelperRunning.mockImplementation((helper) => Boolean(helper && helper.running))
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}))
  })

  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore())
    vi.useRealTimers()
  })

  it('tells settings whether this run is a test-out', async () => {
    const setupModule = freshSetup()
    expect(setupModule.handlers['setup/test-session'](fromSettingsWindow)).toBe(false)
    await settle(setupModule.beginTestSession())
    expect(setupModule.handlers['setup/test-session'](fromSettingsWindow)).toBe(true)
  })

  it('starts Explorer once Alpine has exited, then closes Alpine, without touching the registry', async () => {
    const setupModule = await testSession()
    const result = await settle(setupModule.handlers['setup/end-test-session'](fromSettingsWindow))
    expect(result).toEqual({ success: true, gpoBlocked: false, error: null, leftBehind: [] })
    expect(installerMock.startExplorerWhenAlpineExits).toHaveBeenCalledTimes(1)
    expect(shellShutdown).toHaveBeenCalledTimes(1)
    expect(regCalls).toHaveLength(0)
  })

  it('keeps Alpine open and says so when the helper that starts Explorer did not start', async () => {
    installerMock.startExplorerWhenAlpineExits.mockImplementation(() => null)
    const setupModule = await testSession()
    const result = await settle(setupModule.handlers['setup/end-test-session'](fromSettingsWindow))
    expect(result.success).toBe(false)
    expect(result.error).toBe('Windows Explorer could not be brought back, so Alpine Shell stays open.')
    expect(shellShutdown).not.toHaveBeenCalled()
  })

  it('refuses to end a test that is not running', async () => {
    const result = await settle(freshSetup().handlers['setup/end-test-session'](fromSettingsWindow))
    expect(result).toMatchObject({ success: false, error: 'There is no test to end.' })
    expect(installerMock.startExplorerWhenAlpineExits).not.toHaveBeenCalled()
    expect(shellShutdown).not.toHaveBeenCalled()
  })

  it.each(['setup/revert-temporary', 'setup/revert-permanent', 'setup/uninstall'])('refuses %s during a test-out and changes nothing', async (channel) => {
    const setupModule = await testSession()
    const result = await settle(setupModule.handlers[channel](fromSettingsWindow))
    expect(result).toMatchObject({ success: false, error: 'Alpine Shell is only being tested. Use Return to Windows instead.' })
    expect(installerMock.uninstall).not.toHaveBeenCalled()
    expect(licenceMock.releaseSelf).not.toHaveBeenCalled()
    expect(regCalls).toHaveLength(0)
    expect(shellShutdown).not.toHaveBeenCalled()
  })
})

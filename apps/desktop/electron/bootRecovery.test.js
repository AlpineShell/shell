import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')

const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const WINDOWS_DIR = path.resolve(path.join(path.sep, 'Windows'))
const ALPINE_SHELL = path.resolve(path.join(path.sep, 'Programs', 'alpine-shell', 'Alpine Shell.exe'))
const WINLOGON_LAUNCH = ['Alpine Shell.exe']
const AUTOSTART_LAUNCH = ['Alpine Shell.exe', '--autostart']

let registeredShell = null

function inject(moduleId, exports) {
  nodeRequire.cache[moduleId] = { id: moduleId, filename: moduleId, loaded: true, exports }
}

const execFileSyncMock = vi.fn((file, args) => {
  if (file === 'reg' && args[0] === 'add' && args[1] === WINLOGON_KEY && args[3] === 'Shell') registeredShell = args[7]
  return ''
})
const spawnMock = vi.fn(() => ({ pid: 4242, on: () => {}, unref: () => {} }))
childProcess.execFileSync = (...args) => execFileSyncMock(...args)
childProcess.spawn = (...args) => spawnMock(...args)
inject(nodeRequire.resolve('./registryRead.js'), {
  regQuery: (keyPath, valueName) => (keyPath === WINLOGON_KEY && valueName === 'Shell' ? registeredShell : null),
})

const { default: bootRecovery } = await import('./bootRecovery.js')

const {
  MAX_UNFINISHED_BOOTS,
  START_SHELL,
  CHECK_FOR_EXPLORER_DESKTOP,
  FALL_BACK_TO_EXPLORER,
  EXIT_ALPINE,
  HAND_SIGN_IN_TO_EXPLORER,
  guardsLaunch,
  parseUnfinishedBoots,
  planShellBoot,
  planExplorerDesktopCheck,
  decideShellBoot,
  planFailedStart,
  bootAttemptsPath,
  readUnfinishedBoots,
  recordUnfinishedBoots,
  forgetUnfinishedBoots,
  restoreUnfinishedBoots,
  fallBackToExplorer,
} = bootRecovery

function boot({ unfinishedBoots, argv = WINLOGON_LAUNCH, explorerHostsShell = false }) {
  const shellWhenProbed = []
  const probe = vi.fn(() => {
    shellWhenProbed.push(registeredShell)
    if (explorerHostsShell instanceof Error) throw explorerHostsShell
    return explorerHostsShell
  })
  const plan = decideShellBoot({ unfinishedBoots, argv, shellHostedByExplorer: probe })
  return { plan, probe, shellWhenProbed }
}

function failedStart({ guarded = true, updaterAwaitsReady = false, explorerHostsShell = false, optedOut = false } = {}) {
  const probe = vi.fn(() => explorerHostsShell)
  const optOutLookup = vi.fn(() => optedOut)
  const plan = planFailedStart({
    guarded,
    updaterAwaitsReady,
    get explorerHostsShell() { return probe() },
    get optedOut() { return optOutLookup() },
  })
  return { plan, probe, optOutLookup }
}

let userDataDir = ''
let previousSystemRoot

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-boot-'))
  previousSystemRoot = process.env.SystemRoot
  process.env.SystemRoot = WINDOWS_DIR
  registeredShell = ALPINE_SHELL
  execFileSyncMock.mockClear()
  spawnMock.mockClear()
})

afterEach(() => {
  if (previousSystemRoot === undefined) delete process.env.SystemRoot
  else process.env.SystemRoot = previousSystemRoot
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('guardsLaunch', () => {
  it('guards an installed start', () => {
    expect(guardsLaunch({ packaged: true, portable: false, argv: WINLOGON_LAUNCH })).toBe(true)
    expect(guardsLaunch({ packaged: true, portable: false, argv: AUTOSTART_LAUNCH })).toBe(true)
  })

  it('leaves development, portable, setup and uninstall launches alone', () => {
    expect(guardsLaunch({ packaged: false, portable: false, argv: WINLOGON_LAUNCH })).toBe(false)
    expect(guardsLaunch({ packaged: true, portable: true, argv: WINLOGON_LAUNCH })).toBe(false)
    for (const flag of ['--setup', '--uninstall', '--uninstall-cleanup']) {
      expect(guardsLaunch({ packaged: true, portable: false, argv: [...WINLOGON_LAUNCH, flag] })).toBe(false)
    }
  })
})

describe('parseUnfinishedBoots', () => {
  it('reads a recorded count', () => {
    expect(parseUnfinishedBoots('2')).toBe(2)
    expect(parseUnfinishedBoots(' 1\n')).toBe(1)
  })

  it('treats a missing or damaged count as a clean slate', () => {
    for (const text of [null, undefined, '', 'two', '-1', '1.5']) {
      expect(parseUnfinishedBoots(text)).toBe(0)
    }
  })
})

describe('planShellBoot', () => {
  it('starts the shell and counts the attempt while earlier starts came up', () => {
    expect(planShellBoot({ unfinishedBoots: 0, argv: WINLOGON_LAUNCH })).toEqual({ action: START_SHELL, unfinishedBoots: 1 })
  })

  it('gives a second start a chance after one start that never came up', () => {
    expect(planShellBoot({ unfinishedBoots: 1, argv: WINLOGON_LAUNCH })).toEqual({ action: START_SHELL, unfinishedBoots: 2 })
  })

  it('looks for an Explorer desktop after two starts in a row that never came up', () => {
    expect(planShellBoot({ unfinishedBoots: MAX_UNFINISHED_BOOTS, argv: WINLOGON_LAUNCH })).toEqual({ action: CHECK_FOR_EXPLORER_DESKTOP, unfinishedBoots: 2 })
  })

  it('keeps quiet at a sign-in Explorer already runs', () => {
    expect(planShellBoot({ unfinishedBoots: 2, argv: AUTOSTART_LAUNCH })).toEqual({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: false })
  })
})

describe('planExplorerDesktopCheck', () => {
  it('hands the sign-in to Explorer when no Explorer desktop is running', () => {
    expect(planExplorerDesktopCheck({ unfinishedBoots: 2, explorerHostsShell: false })).toEqual({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: true })
  })

  it('starts Explorer when it cannot tell who holds the shell', () => {
    expect(planExplorerDesktopCheck({ unfinishedBoots: 2, explorerHostsShell: null }).startExplorer).toBe(true)
  })

  it('gives a start from the Start menu on a working Explorer desktop a fresh try', () => {
    expect(planExplorerDesktopCheck({ unfinishedBoots: 2, explorerHostsShell: true })).toEqual({ action: START_SHELL, unfinishedBoots: 3 })
  })

  it('falls back at once after a fresh try that did not come up either', () => {
    expect(planExplorerDesktopCheck({ unfinishedBoots: 3, explorerHostsShell: false }).action).toBe(FALL_BACK_TO_EXPLORER)
  })
})

describe('decideShellBoot', () => {
  it('neither probes nor touches the shell while earlier starts came up', () => {
    const { plan, probe } = boot({ unfinishedBoots: 1 })
    expect(plan).toEqual({ action: START_SHELL, unfinishedBoots: 2 })
    expect(probe).not.toHaveBeenCalled()
    expect(execFileSyncMock).not.toHaveBeenCalled()
  })

  it('does not probe at a sign-in Explorer already runs', () => {
    const { plan, probe } = boot({ unfinishedBoots: 2, argv: AUTOSTART_LAUNCH, explorerHostsShell: true })
    expect(plan).toEqual({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: false })
    expect(probe).not.toHaveBeenCalled()
  })

  it('registers Explorer as the shell before it probes, so a probe that dies still leaves the next sign-in on Explorer', () => {
    const { plan, shellWhenProbed } = boot({ unfinishedBoots: 2 })
    expect(shellWhenProbed).toEqual(['explorer.exe'])
    expect(plan).toEqual({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: true })
    expect(registeredShell).toBe('explorer.exe')
  })

  it('puts the shell back for a fresh try from the Start menu on a working Explorer desktop', () => {
    const { plan, shellWhenProbed } = boot({ unfinishedBoots: 2, explorerHostsShell: true })
    expect(shellWhenProbed).toEqual(['explorer.exe'])
    expect(plan).toEqual({ action: START_SHELL, unfinishedBoots: 3 })
    expect(registeredShell).toBe(ALPINE_SHELL)
  })

  it('writes nothing back when Explorer already was the shell', () => {
    registeredShell = 'explorer.exe'
    expect(boot({ unfinishedBoots: 2, explorerHostsShell: true }).plan.action).toBe(START_SHELL)
    expect(execFileSyncMock).toHaveBeenCalledTimes(1)
    expect(registeredShell).toBe('explorer.exe')
  })

  it('falls back when the probe throws', () => {
    const quietErrors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { plan } = boot({ unfinishedBoots: 2, explorerHostsShell: new Error('koffi failed to load') })
    expect(plan).toEqual({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: true })
    expect(registeredShell).toBe('explorer.exe')
    quietErrors.mockRestore()
  })
})

describe('planFailedStart', () => {
  it('hands the sign-in to Explorer when a start that holds the shell fails', () => {
    expect(failedStart().plan).toEqual({ action: HAND_SIGN_IN_TO_EXPLORER })
  })

  it('only exits when Explorer already runs the desktop', () => {
    const { plan, optOutLookup } = failedStart({ explorerHostsShell: true })
    expect(plan).toEqual({ action: EXIT_ALPINE })
    expect(optOutLookup).not.toHaveBeenCalled()
  })

  it('hands the sign-in to Explorer when it cannot tell who holds the shell', () => {
    expect(failedStart({ explorerHostsShell: null }).plan.action).toBe(HAND_SIGN_IN_TO_EXPLORER)
  })

  it('never makes Alpine the shell again for someone who turned it off for good', () => {
    expect(failedStart({ optedOut: true }).plan).toEqual({ action: FALL_BACK_TO_EXPLORER, startExplorer: true })
  })

  it('leaves a failed update restart to the update helper, which is waiting for it', () => {
    const { plan, probe } = failedStart({ updaterAwaitsReady: true })
    expect(plan).toEqual({ action: EXIT_ALPINE })
    expect(probe).not.toHaveBeenCalled()
  })

  it('only exits for development, portable, setup and uninstall launches, so they never touch the shell', () => {
    const { plan, probe } = failedStart({ guarded: false })
    expect(plan).toEqual({ action: EXIT_ALPINE })
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('the start attempt record', () => {
  it('reads nothing as no unfinished starts', () => {
    expect(readUnfinishedBoots(bootAttemptsPath(userDataDir))).toBe(0)
  })

  it('keeps the count between starts until the shell comes up', () => {
    const filePath = bootAttemptsPath(userDataDir)
    recordUnfinishedBoots(filePath, 2)
    expect(readUnfinishedBoots(filePath)).toBe(2)

    forgetUnfinishedBoots(filePath)
    expect(readUnfinishedBoots(filePath)).toBe(0)
  })

  it('puts back the count from before a launch that exits on purpose', () => {
    const filePath = bootAttemptsPath(userDataDir)
    recordUnfinishedBoots(filePath, 2)

    restoreUnfinishedBoots(filePath, 1)
    expect(readUnfinishedBoots(filePath)).toBe(1)

    restoreUnfinishedBoots(filePath, 0)
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('creates the user data folder on the very first start', () => {
    const filePath = bootAttemptsPath(path.join(userDataDir, 'fresh'))
    recordUnfinishedBoots(filePath, 1)
    expect(readUnfinishedBoots(filePath)).toBe(1)
  })
})

describe('fallBackToExplorer', () => {
  it('registers Explorer as the shell and starts it', () => {
    fallBackToExplorer({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: true })

    expect(execFileSyncMock).toHaveBeenCalledWith('reg', ['add', WINLOGON_KEY, '/v', 'Shell', '/t', 'REG_SZ', '/d', 'explorer.exe', '/f'], { windowsHide: true })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock.mock.calls[0][0]).toBe(path.join(WINDOWS_DIR, 'explorer.exe'))
    expect(spawnMock.mock.calls[0][2]).toMatchObject({ detached: true, cwd: WINDOWS_DIR })
  })

  it('does not start a second Explorer when one already holds the shell', () => {
    fallBackToExplorer({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: false })

    expect(execFileSyncMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('still starts Explorer when the shell registration cannot be written', () => {
    const quietErrors = vi.spyOn(console, 'error').mockImplementation(() => {})
    execFileSyncMock.mockImplementationOnce(() => { throw new Error('Access is denied.') })

    fallBackToExplorer({ action: FALL_BACK_TO_EXPLORER, unfinishedBoots: 2, startExplorer: true })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    quietErrors.mockRestore()
  })
})

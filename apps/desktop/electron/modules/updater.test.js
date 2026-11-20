import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-updater-'))
let licenceToken = 'token-1'
let appVersion = '1.2.3'
const licenceListeners = new Set()
const checkCalls = []
const downloadCalls = []
const updaterListeners = new Map()

const fakeAutoUpdater = {
  requestHeaders: undefined,
  autoDownload: true,
  autoInstallOnAppQuit: true,
  on: (event, listener) => {
    updaterListeners.set(event, listener)
  },
  checkForUpdates: () => {
    checkCalls.push({ ...fakeAutoUpdater.requestHeaders })
    return Promise.resolve()
  },
  downloadUpdate: () => {
    downloadCalls.push({ ...fakeAutoUpdater.requestHeaders })
    return Promise.resolve()
  },
  quitAndInstall: () => undefined,
}

class FakeCancellationToken {
  cancel() {}
}

function inject(moduleId, exports) {
  nodeRequire.cache[moduleId] = { id: moduleId, filename: moduleId, loaded: true, exports }
}

const stageInstallerMock = vi.fn()
const startBrandedUpdateMock = vi.fn(() => false)
const startStagedSwapMock = vi.fn(() => true)
const installDir = path.join(userDataDir, 'install-root')
const installedExePath = path.join(installDir, 'Alpine Shell.exe')

inject(nodeRequire.resolve('electron'), {
  app: { getPath: () => userDataDir, isPackaged: true, getVersion: () => appVersion, exit: () => undefined },
})
inject(nodeRequire.resolve('electron-updater'), { autoUpdater: fakeAutoUpdater, CancellationToken: FakeCancellationToken })
inject(nodeRequire.resolve('./licence.js'), {
  currentToken: () => licenceToken,
  onStatusChanged: (listener) => {
    licenceListeners.add(listener)
    return () => licenceListeners.delete(listener)
  },
})
inject(nodeRequire.resolve('./installer.js'), {
  getInstallDir: () => installDir,
  getInstalledExePath: () => installedExePath,
  startBrandedUpdate: (...args) => startBrandedUpdateMock(...args),
  startStagedSwap: (...args) => startStagedSwapMock(...args),
  ensureUpdaterExeAsync: () => Promise.resolve(),
})
inject(nodeRequire.resolve('./stagedUpdate.js'), {
  canStageVersion: (target, current) => target !== current,
  stageInstaller: (...args) => stageInstallerMock(...args),
})
inject(nodeRequire.resolve('./frecency.js'), { flush: () => undefined })
inject(nodeRequire.resolve('./appIcons.js'), { flushDiskCache: () => undefined })

const { default: updater } = await import('./updater.js')

function setLicence(token) {
  licenceToken = token
  for (const listener of licenceListeners) listener({ state: token ? 'valid' : 'unlicensed' })
}

function feedError(statusCode) {
  const error = new Error(`${statusCode} refused`)
  error.statusCode = statusCode
  return error
}

const broadcasts = []

beforeEach(() => {
  vi.useFakeTimers()
  broadcasts.length = 0
  checkCalls.length = 0
  downloadCalls.length = 0
  licenceToken = 'token-1'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the update feed credentials', () => {
  it('sends the licence token as a bearer header on the first check and every six hours after', () => {
    updater.start((channel, data) => broadcasts.push({ channel, data }))
    expect(checkCalls).toHaveLength(0)
    vi.advanceTimersByTime(updater.INITIAL_CHECK_DELAY_MS)
    expect(checkCalls).toEqual([{ Authorization: 'Bearer token-1' }])
    expect(fakeAutoUpdater.autoDownload).toBe(false)
    expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(false)
    vi.advanceTimersByTime(updater.CHECK_INTERVAL_MS)
    expect(checkCalls).toHaveLength(2)
    expect(updater.CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000)
  })

  it('refreshes the header when the licence changes', () => {
    setLicence('token-2')
    expect(fakeAutoUpdater.requestHeaders).toEqual({ Authorization: 'Bearer token-2' })
    expect(checkCalls).toHaveLength(0)
  })

  it('clears the header and skips scheduled checks once there is no licence token', () => {
    setLicence(null)
    expect(fakeAutoUpdater.requestHeaders).toBeNull()
    vi.advanceTimersByTime(updater.CHECK_INTERVAL_MS)
    expect(checkCalls).toHaveLength(0)
  })

  it('tells a signed-out user why a manual check did nothing', () => {
    setLicence(null)
    const state = updater.handlers['updates/check']()
    expect(state).toMatchObject({ status: 'error', error: updater.SIGN_IN_FOR_UPDATES_MESSAGE, signInRequired: true })
    expect(checkCalls).toHaveLength(0)
    expect(updater.handlers['updates/get-log']().at(-1).message).toBe(updater.SIGN_IN_FOR_UPDATES_MESSAGE)
  })

  it('checks as soon as a licence becomes usable', () => {
    setLicence(null)
    updater.handlers['updates/check']()
    setLicence('token-4')
    expect(checkCalls).toEqual([{ Authorization: 'Bearer token-4' }])
    updaterListeners.get('checking-for-update')()
    expect(updater.handlers['updates/get-state']().signInRequired).toBe(false)
    setLicence('token-4b')
    expect(checkCalls).toHaveLength(1)
    expect(fakeAutoUpdater.requestHeaders).toEqual({ Authorization: 'Bearer token-4b' })
  })

  it('downloads with the current token and refuses without one', () => {
    setLicence('token-5')
    updaterListeners.get('update-available')({ version: '9.9.9' })
    updater.handlers['updates/download']()
    expect(downloadCalls).toEqual([{ Authorization: 'Bearer token-5' }])
    updaterListeners.get('error')(new Error('cancelled'))
    setLicence(null)
    updater.handlers['updates/download']()
    expect(downloadCalls).toHaveLength(1)
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'error', error: updater.SIGN_IN_FOR_UPDATES_MESSAGE })
  })
})

describe('a feed that refuses the licence', () => {
  it.each([401, 403])('says in plain words that updates are not available for this licence on a %i and stops retrying', (statusCode) => {
    setLicence('token-6')
    updater.handlers['updates/check']()
    updaterListeners.get('error')(feedError(statusCode))
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'error', error: updater.UPDATES_REFUSED_FOR_LICENCE_MESSAGE })
    expect(updater.handlers['updates/get-log']().at(-1).message).toBe(updater.UPDATES_REFUSED_FOR_LICENCE_MESSAGE)
    const checksSoFar = checkCalls.length
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(checkCalls).toHaveLength(checksSoFar)
  })

  it('keeps reporting other feed errors as they are', () => {
    setLicence('token-7')
    updaterListeners.get('error')(feedError(503))
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'error', error: '503 refused' })
  })
})

describe('the update-check switch', () => {
  const preferencesFile = path.join(userDataDir, updater.PREFERENCES_FILE)

  afterEach(() => {
    updater.handlers['updates/set-preferences'](null, { checkForUpdates: true })
  })

  it('is on by default', () => {
    expect(updater.handlers['updates/get-preferences']()).toEqual({ checkForUpdates: true, channel: 'stable' })
    expect(fs.existsSync(preferencesFile)).toBe(false)
  })

  it('persists the choice in update-prefs.json and broadcasts it', () => {
    broadcasts.length = 0
    expect(updater.handlers['updates/set-preferences'](null, { checkForUpdates: false })).toEqual({ checkForUpdates: false, channel: 'stable' })
    expect(JSON.parse(fs.readFileSync(preferencesFile, 'utf8'))).toEqual({ checkForUpdates: false })
    expect(broadcasts.find((b) => b.channel === 'updates/preferences-changed')?.data).toEqual({ checkForUpdates: false, channel: 'stable' })
    expect(updater.handlers['updates/set-preferences'](null, { checkForUpdates: 'yes' })).toEqual({ checkForUpdates: false, channel: 'stable' })
    expect(updater.handlers['updates/set-preferences'](null, {})).toEqual({ checkForUpdates: false, channel: 'stable' })
  })

  it('makes no request at all while off: not on the schedule, not by hand, not when the licence changes, not for a download', () => {
    setLicence('token-8')
    updater.handlers['updates/set-preferences'](null, { checkForUpdates: false })
    const checksBefore = checkCalls.length
    vi.advanceTimersByTime(3 * updater.CHECK_INTERVAL_MS)
    expect(updater.handlers['updates/check']()).toMatchObject({ status: 'not-available' })
    setLicence(null)
    setLicence('token-8b')
    updater.handlers['updates/download']()
    expect(checkCalls).toHaveLength(checksBefore)
    expect(downloadCalls).toHaveLength(0)
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'error', error: updater.UPDATE_CHECKS_OFF_MESSAGE })
  })

  it('says in the log what off means when someone checks by hand', () => {
    updater.handlers['updates/set-preferences'](null, { checkForUpdates: false })
    updater.handlers['updates/check']()
    const messages = updater.handlers['updates/get-log']().map((entry) => entry.message)
    expect(messages.at(-1)).toBe(updater.UPDATE_CHECKS_OFF_MESSAGE)
    expect(messages.at(-2)).toBe('Checking for updates…')
  })

  it('forgets an offered update when turned off and checks straight away when turned back on', () => {
    setLicence('token-9')
    updaterListeners.get('update-available')({ version: '9.9.9' })
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'available', availableVersion: '9.9.9' })
    updater.handlers['updates/set-preferences'](null, { checkForUpdates: false })
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'not-available', availableVersion: null })
    const checksBefore = checkCalls.length
    updater.handlers['updates/set-preferences'](null, { checkForUpdates: true })
    expect(checkCalls).toHaveLength(checksBefore + 1)
    expect(checkCalls.at(-1)).toEqual({ Authorization: 'Bearer token-9' })
  })
})

describe('changelogUrl', () => {
  it('opens the changelog at the version on its channel', () => {
    expect(updater.changelogUrl('https://alpineshell.com', '0.1.0')).toBe('https://alpineshell.com/changelog#v0.1.0')
    expect(updater.changelogUrl('https://alpineshell.com', '0.1.1-nightly.20261102.0')).toBe('https://alpineshell.com/changelog?channel=nightly#v0.1.1-nightly.20261102.0')
    expect(updater.changelogUrl('https://alpineshell.com', '')).toBe('https://alpineshell.com/changelog')
  })
})

describe('the update channel', () => {
  const preferencesFile = path.join(userDataDir, updater.PREFERENCES_FILE)

  function logMessages() {
    return updater.handlers['updates/get-log']().map((entry) => entry.message)
  }

  it('follows stable releases on a stable build and reads latest.yml without allowing a downgrade', () => {
    setLicence('token-10')
    updater.handlers['updates/check']()
    expect(fakeAutoUpdater.channel).toBe('latest')
    expect(fakeAutoUpdater.allowDowngrade).toBe(false)
  })

  it('switches to nightly.yml, remembers the choice and checks straight away', () => {
    setLicence('token-11')
    const checksBefore = checkCalls.length
    expect(updater.handlers['updates/set-preferences'](null, { channel: 'nightly' })).toEqual({ checkForUpdates: true, channel: 'nightly' })
    expect(JSON.parse(fs.readFileSync(preferencesFile, 'utf8'))).toEqual({ checkForUpdates: true, channel: 'nightly' })
    expect(checkCalls).toHaveLength(checksBefore + 1)
    expect(fakeAutoUpdater.channel).toBe('nightly')
    expect(fakeAutoUpdater.allowDowngrade).toBe(false)
    expect(logMessages()).toContain('Switched to nightly builds')
  })

  it('forgets an update offered on the other channel', () => {
    setLicence('token-12')
    updaterListeners.get('update-available')({ version: '1.2.4-nightly.20261102.0' })
    updater.handlers['updates/set-preferences'](null, { channel: 'stable' })
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'idle', availableVersion: null })
    expect(fakeAutoUpdater.channel).toBe('latest')
  })

  it('lets a build from before 0.1.0 move down to the first numbered release', () => {
    setLicence('token-14')
    appVersion = '0.20261103.0'
    try {
      updater.handlers['updates/check']()
      expect(fakeAutoUpdater.allowDowngrade).toBe(true)
    } finally {
      appVersion = '1.2.3'
    }
  })

  it('ignores a channel it does not know', () => {
    expect(updater.handlers['updates/set-preferences'](null, { channel: 'beta' })).toEqual({ checkForUpdates: true, channel: 'stable' })
  })

  it('says there is no build yet when the channel has no feed', () => {
    setLicence('token-13')
    updater.handlers['updates/set-preferences'](null, { channel: 'nightly' })
    const missingFeed = new Error('Cannot find channel "nightly.yml" update info')
    missingFeed.code = 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
    updaterListeners.get('error')(missingFeed)
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'not-available', error: null })
    expect(logMessages().at(-1)).toBe('No nightly build yet')
    updater.handlers['updates/set-preferences'](null, { channel: 'stable' })
  })
})

describe('background staging and instant swap', () => {
  beforeEach(() => {
    stageInstallerMock.mockReset()
    startBrandedUpdateMock.mockReset()
    startStagedSwapMock.mockReset()
    startStagedSwapMock.mockReturnValue(true)
    updater.setSwapHandler(null)
  })

  it('stages a downloaded update in the background and swaps via swapHandler without showing the update screen', async () => {
    const stagedExe = path.join(installDir, 'versions', '1.3.0', 'Alpine Shell.exe')
    fs.mkdirSync(path.dirname(stagedExe), { recursive: true })
    fs.writeFileSync(stagedExe, '')
    let resolveStage
    stageInstallerMock.mockReturnValue(new Promise((resolve) => { resolveStage = resolve }))

    updaterListeners.get('update-downloaded')({ version: '1.3.0', downloadedFile: path.join(userDataDir, 'setup.exe') })
    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'preparing', availableVersion: '1.3.0', progressPercent: 100 })
    expect(updater.isUpdatePending()).toBe(true)

    resolveStage({ ok: true, exePath: stagedExe, versionDir: path.dirname(stagedExe) })
    await Promise.resolve()
    await Promise.resolve()

    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'downloaded', availableVersion: '1.3.0', progressPercent: 100 })

    const swapHandler = vi.fn(() => true)
    updater.setSwapHandler(swapHandler)
    updater.handlers['updates/install']()

    expect(swapHandler).toHaveBeenCalledWith({ targetExePath: stagedExe, targetVersion: '1.3.0' })
    expect(startBrandedUpdateMock).not.toHaveBeenCalled()
  })

  it('falls back to the branded installer when staging fails', async () => {
    const downloadedPath = path.join(userDataDir, 'setup-fail.exe')
    stageInstallerMock.mockResolvedValue({ ok: false, reason: 'extract-failed' })
    startBrandedUpdateMock.mockReturnValue(true)

    updaterListeners.get('update-downloaded')({ version: '1.3.1', downloadedFile: downloadedPath })
    await Promise.resolve()
    await Promise.resolve()

    expect(updater.handlers['updates/get-state']()).toMatchObject({ status: 'downloaded', availableVersion: '1.3.1' })

    const swapHandler = vi.fn(() => true)
    updater.setSwapHandler(swapHandler)
    updater.handlers['updates/install']()

    expect(swapHandler).not.toHaveBeenCalled()
    expect(startBrandedUpdateMock).toHaveBeenCalledWith(downloadedPath, '1.3.1')
  })
})

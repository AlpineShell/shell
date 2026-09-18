import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-updater-'))
let licenceToken = 'token-1'
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

inject(nodeRequire.resolve('electron'), {
  app: { getPath: () => userDataDir, isPackaged: true, getVersion: () => '1.2.3', exit: () => undefined },
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
  startBrandedUpdate: () => false,
  ensureUpdaterExeAsync: () => Promise.resolve(),
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
    expect(state).toMatchObject({ status: 'error', error: updater.SIGN_IN_FOR_UPDATES_MESSAGE })
    expect(checkCalls).toHaveLength(0)
    expect(updater.handlers['updates/get-log']().at(-1).message).toBe(updater.SIGN_IN_FOR_UPDATES_MESSAGE)
  })

  it('checks as soon as a licence becomes usable', () => {
    setLicence(null)
    setLicence('token-4')
    expect(checkCalls).toEqual([{ Authorization: 'Bearer token-4' }])
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

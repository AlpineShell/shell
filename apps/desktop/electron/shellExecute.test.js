import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import shellExecute from './shellExecute.js'

const { splitCommandLine, startProcessCommand, shellExecuteElevated, isMarkedFromInternet } = shellExecute

let fixtureDir
let spacedExecutable

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine shell exec '))
  spacedExecutable = path.join(fixtureDir, 'my app.exe')
  fs.writeFileSync(spacedExecutable, '')
})

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('splitCommandLine', () => {
  it('returns an empty file for blank input', () => {
    expect(splitCommandLine('')).toEqual({ file: '', args: '' })
    expect(splitCommandLine(null)).toEqual({ file: '', args: '' })
  })

  it('splits a quoted path from its arguments', () => {
    expect(splitCommandLine('"C:\\Program Files\\App\\app.exe" --start /min')).toEqual({
      file: 'C:\\Program Files\\App\\app.exe',
      args: '--start /min',
    })
  })

  it('keeps an unterminated quoted path whole', () => {
    expect(splitCommandLine('"C:\\Program Files\\App\\app.exe')).toEqual({
      file: 'C:\\Program Files\\App\\app.exe',
      args: '',
    })
  })

  it('keeps an unquoted existing path with spaces whole', () => {
    expect(splitCommandLine(spacedExecutable)).toEqual({ file: spacedExecutable, args: '' })
  })

  it('splits an unquoted existing path with spaces from its arguments', () => {
    expect(splitCommandLine(`${spacedExecutable} --background`)).toEqual({
      file: spacedExecutable,
      args: '--background',
    })
  })

  it('falls back to the first space when nothing on disk matches', () => {
    expect(splitCommandLine('alpine-no-such-binary.exe --flag one')).toEqual({
      file: 'alpine-no-such-binary.exe',
      args: '--flag one',
    })
  })

  it('returns the whole token when there is no space', () => {
    expect(splitCommandLine('alpine-no-such-binary.exe')).toEqual({ file: 'alpine-no-such-binary.exe', args: '' })
  })
})

describe('startProcessCommand', () => {
  it('starts a file, with its arguments when there are any', () => {
    expect(startProcessCommand('app.exe', null, null)).toBe("Start-Process -FilePath 'app.exe'")
    expect(startProcessCommand('app.exe', '--flag one', null)).toBe("Start-Process -FilePath 'app.exe' -ArgumentList '--flag one'")
  })

  it('asks Windows for elevation with the runas verb', () => {
    expect(startProcessCommand('Tool.lnk', null, 'runas')).toBe("Start-Process -FilePath 'Tool.lnk' -Verb 'runas'")
  })

  it('keeps a typographic apostrophe in a shortcut name inside the string', () => {
    expect(startProcessCommand('O\u2019Brien\u2019s Tool.lnk', null, 'runas')).toBe("Start-Process -FilePath 'O\u2019\u2019Brien\u2019\u2019s Tool.lnk' -Verb 'runas'")
  })
})

function makeFakeWorker() {
  const worker = new EventEmitter()
  worker.postMessage = vi.fn()
  worker.terminate = vi.fn(() => Promise.resolve(0))
  return worker
}

describe('shellExecuteElevated', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('asks for elevation on a worker of its own and stops that worker after the answer', async () => {
    const consentWorker = makeFakeWorker()
    const startConsentWorker = vi.fn(() => consentWorker)
    const launched = shellExecuteElevated('Tool.lnk', { startConsentWorker })

    expect(startConsentWorker).toHaveBeenCalledTimes(1)
    const [request] = consentWorker.postMessage.mock.calls[0]
    expect(request).toMatchObject({ file: 'Tool.lnk', args: null, verb: 'runas' })

    consentWorker.emit('message', { ready: true })
    consentWorker.emit('message', { id: request.id, ok: true })
    await expect(launched).resolves.toBe(true)
    expect(consentWorker.terminate).toHaveBeenCalledTimes(1)
  })

  it('lets a second request finish while the first prompt is still open', async () => {
    const workers = [makeFakeWorker(), makeFakeWorker()]
    const startConsentWorker = vi.fn(() => workers[startConsentWorker.mock.calls.length - 1])
    const first = shellExecuteElevated('First.lnk', { startConsentWorker })
    const second = shellExecuteElevated('Second.lnk', { startConsentWorker })

    workers[1].emit('message', { id: workers[1].postMessage.mock.calls[0][0].id, ok: true })
    await expect(second).resolves.toBe(true)
    expect(workers[0].terminate).not.toHaveBeenCalled()

    workers[0].emit('message', { id: workers[0].postMessage.mock.calls[0][0].id, ok: false, detail: '5' })
    await expect(first).resolves.toBe(false)
    expect(workers[0].terminate).toHaveBeenCalledTimes(1)
  })

  it('stops waiting when the prompt stays open past the consent timeout', async () => {
    vi.useFakeTimers()
    const consentWorker = makeFakeWorker()
    const launched = shellExecuteElevated('Tool.lnk', { startConsentWorker: () => consentWorker, timeoutMs: 1000 })

    vi.advanceTimersByTime(999)
    expect(consentWorker.terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await expect(launched).resolves.toBe(false)
    expect(consentWorker.terminate).toHaveBeenCalledTimes(1)
  })

  it('reports a worker that exits without answering as not launched', async () => {
    const consentWorker = makeFakeWorker()
    const launched = shellExecuteElevated('Tool.lnk', { startConsentWorker: () => consentWorker })

    consentWorker.emit('exit', 1)
    await expect(launched).resolves.toBe(false)
  })

  it('starts no worker for an empty target', async () => {
    const startConsentWorker = vi.fn()
    await expect(shellExecuteElevated('  ', { startConsentWorker })).resolves.toBe(false)
    expect(startConsentWorker).not.toHaveBeenCalled()
  })

  it('lets Windows show the SmartScreen prompt when the file was downloaded', () => {
    const consentWorker = makeFakeWorker()
    shellExecuteElevated(downloadedExecutable, { startConsentWorker: () => consentWorker })
    expect(consentWorker.postMessage.mock.calls[0][0]).toMatchObject({ file: downloadedExecutable, verb: 'runas', showUi: true })
  })

  it('keeps the prompt-free launch for a file that was not downloaded', () => {
    const consentWorker = makeFakeWorker()
    shellExecuteElevated('Tool.lnk', { startConsentWorker: () => consentWorker })
    expect(consentWorker.postMessage.mock.calls[0][0]).toMatchObject({ showUi: false })
  })
})

function markAsDownloaded(file, zone) {
  fs.writeFileSync(file, '')
  fs.writeFileSync(`${file}:Zone.Identifier`, `[ZoneTransfer]\r\nZoneId=${zone}\r\nHostUrl=https://example.invalid/setup.exe\r\n`)
}

let downloadedExecutable
let intranetExecutable

beforeAll(() => {
  downloadedExecutable = path.join(fixtureDir, 'setup.exe')
  intranetExecutable = path.join(fixtureDir, 'intranet.exe')
  markAsDownloaded(downloadedExecutable, 3)
  markAsDownloaded(intranetExecutable, 1)
})

describe('isMarkedFromInternet', () => {
  it('spots a file Windows marked as coming from the internet', () => {
    expect(isMarkedFromInternet(downloadedExecutable)).toBe(true)
  })

  it('leaves files from the local intranet and unmarked files alone', () => {
    expect(isMarkedFromInternet(intranetExecutable)).toBe(false)
    expect(isMarkedFromInternet(spacedExecutable)).toBe(false)
    expect(isMarkedFromInternet(path.join(fixtureDir, 'missing.exe'))).toBe(false)
  })
})

describe('shellExecute on a downloaded file', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('launches it on a worker of its own that lets the SmartScreen prompt appear', async () => {
    const promptWorker = makeFakeWorker()
    const launched = shellExecute.shellExecute(downloadedExecutable, '--quiet', { startPromptWorker: () => promptWorker })
    const [request] = promptWorker.postMessage.mock.calls[0]
    expect(request).toMatchObject({ file: downloadedExecutable, args: '--quiet', verb: null, showUi: true })
    promptWorker.emit('message', { id: request.id, ok: true })
    await expect(launched).resolves.toBe(true)
    expect(promptWorker.terminate).toHaveBeenCalledTimes(1)
  })

  it('reports the launch SmartScreen cancelled as not launched', async () => {
    const promptWorker = makeFakeWorker()
    const launched = shellExecute.shellExecute(downloadedExecutable, null, { startPromptWorker: () => promptWorker })
    const [request] = promptWorker.postMessage.mock.calls[0]
    promptWorker.emit('message', { id: request.id, ok: false, detail: '1223' })
    await expect(launched).resolves.toBe(false)
  })
})

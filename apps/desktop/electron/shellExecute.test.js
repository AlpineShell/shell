import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import shellExecute from './shellExecute.js'

const { splitCommandLine, startProcessCommand, shellExecuteElevated } = shellExecute

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
})

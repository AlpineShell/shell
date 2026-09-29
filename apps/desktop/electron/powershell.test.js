import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { createPersistentRunner, runPowerShellFile, quotePowerShellLiteral, escapePowerShellSingleQuoted } from './powershell.js'

const SCRIPT_PATH = path.resolve(path.join(path.sep, 'scripts', 'bluetoothRadio.ps1'))

function makeFakeChild() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('runPowerShellFile', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawns powershell.exe directly with the script after -File', () => {
    const spawnProcess = vi.fn(() => makeFakeChild())
    runPowerShellFile(SCRIPT_PATH, ['-Action', 'get'], { spawnProcess })

    const [file, args, options] = spawnProcess.mock.calls[0]
    expect(file).toBe('powershell.exe')
    expect(args.slice(args.indexOf('-File'))).toEqual(['-File', SCRIPT_PATH, '-Action', 'get'])
    expect(options.windowsHide).toBe(true)
  })

  it('resolves the trimmed stdout when the script exits cleanly', async () => {
    const child = makeFakeChild()
    const result = runPowerShellFile(SCRIPT_PATH, [], { spawnProcess: () => child })

    child.stdout.emit('data', Buffer.from('{"state":"on"}\r\n'))
    child.emit('close', 0)

    await expect(result).resolves.toEqual({ stdout: '{"state":"on"}', stderr: '', exitCode: 0, timedOut: false })
  })

  it('reports the exit code and a bounded stderr excerpt on failure', async () => {
    const child = makeFakeChild()
    const result = runPowerShellFile(SCRIPT_PATH, [], { spawnProcess: () => child })

    child.stderr.emit('data', Buffer.from('x'.repeat(2000)))
    child.emit('close', 1)

    const settled = await result
    expect(settled.exitCode).toBe(1)
    expect(settled.stderr.length).toBeLessThanOrEqual(400)
  })

  it('kills the process at the deadline and resolves without waiting for close', async () => {
    const child = makeFakeChild()
    const result = runPowerShellFile(SCRIPT_PATH, [], { timeoutMs: 5000, spawnProcess: () => child })

    await vi.advanceTimersByTimeAsync(5000)

    expect(child.kill).toHaveBeenCalledTimes(1)
    await expect(result).resolves.toMatchObject({ exitCode: null, timedOut: true })
  })

  it('settles only once when close arrives after the deadline', async () => {
    const child = makeFakeChild()
    const result = runPowerShellFile(SCRIPT_PATH, [], { timeoutMs: 1000, spawnProcess: () => child })

    await vi.advanceTimersByTimeAsync(1000)
    child.stdout.emit('data', Buffer.from('late'))
    child.emit('close', 0)

    await expect(result).resolves.toMatchObject({ stdout: '', timedOut: true })
  })

  it('resolves instead of rejecting when the process cannot start', async () => {
    const child = makeFakeChild()
    const result = runPowerShellFile(SCRIPT_PATH, [], { spawnProcess: () => child })

    child.emit('error', new Error('spawn powershell.exe ENOENT'))

    await expect(result).resolves.toMatchObject({ exitCode: null, timedOut: false, stderr: 'spawn powershell.exe ENOENT' })
  })

  it('resolves when spawning throws synchronously', async () => {
    const spawnProcess = () => {
      throw new Error('spawn failed')
    }

    await expect(runPowerShellFile(SCRIPT_PATH, [], { spawnProcess })).resolves.toMatchObject({ exitCode: null, stderr: 'spawn failed' })
  })
})

const DELIM = '__PS_PERSISTENT_DONE__'

function makeFakeWorker() {
  const worker = new EventEmitter()
  worker.writes = []
  worker.killed = false
  worker.exitCode = null
  worker.stdout = new EventEmitter()
  worker.stdin = new EventEmitter()
  worker.stdin.write = (text) => { worker.writes.push(text); return true }
  worker.kill = () => { worker.killed = true }
  worker.complete = (result) => worker.stdout.emit('data', Buffer.from(`${result}\n${DELIM}\n`))
  return worker
}

function commandWrites(worker) {
  return worker.writes.filter((text) => text.includes(DELIM))
}

describe('createPersistentRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs queued commands serially in order', async () => {
    const worker = makeFakeWorker()
    const spawnWorker = vi.fn(() => worker)
    const runner = createPersistentRunner(spawnWorker)

    const first = runner.run('CommandOne')
    const second = runner.run('CommandTwo')

    expect(spawnWorker).toHaveBeenCalledTimes(1)
    expect(commandWrites(worker)).toHaveLength(1)
    expect(worker.writes.some((w) => w.includes('CommandOne'))).toBe(true)
    expect(worker.writes.some((w) => w.includes('CommandTwo'))).toBe(false)

    worker.complete('resultOne')
    await expect(first).resolves.toBe('resultOne')

    expect(commandWrites(worker)).toHaveLength(2)
    worker.complete('resultTwo')
    await expect(second).resolves.toBe('resultTwo')

    expect(spawnWorker).toHaveBeenCalledTimes(1)
  })

  it('times out a hung command without wedging the queue', async () => {
    const workers = [makeFakeWorker(), makeFakeWorker()]
    let spawnCount = 0
    const spawnWorker = vi.fn(() => workers[spawnCount++])
    const runner = createPersistentRunner(spawnWorker, 5000)

    const hung = runner.run('HangsForever')
    const next = runner.run('Recovers')

    await vi.advanceTimersByTimeAsync(5000)
    await expect(hung).resolves.toBe('')
    expect(workers[0].killed).toBe(true)
    expect(spawnWorker).toHaveBeenCalledTimes(2)

    workers[1].complete('recovered')
    await expect(next).resolves.toBe('recovered')
  })

  it('restarts the worker after it dies and drains in-flight commands', async () => {
    const workers = [makeFakeWorker(), makeFakeWorker()]
    let spawnCount = 0
    const spawnWorker = vi.fn(() => workers[spawnCount++])
    const runner = createPersistentRunner(spawnWorker)

    const dropped = runner.run('InFlight')
    workers[0].emit('exit')
    await expect(dropped).resolves.toBe('')

    const revived = runner.run('AfterRestart')
    expect(spawnWorker).toHaveBeenCalledTimes(2)
    workers[1].complete('alive')
    await expect(revived).resolves.toBe('alive')
  })

  it('dispatches to a fresh worker when the previous exited before the next write (data-before-exit race)', async () => {
    const workers = [makeFakeWorker(), makeFakeWorker()]
    let spawnCount = 0
    const spawnWorker = vi.fn(() => workers[spawnCount++])
    const runner = createPersistentRunner(spawnWorker)

    const a = runner.run('A')
    const b = runner.run('B')

    workers[0].exitCode = 0
    workers[0].complete('ra')
    await expect(a).resolves.toBe('ra')

    expect(spawnWorker).toHaveBeenCalledTimes(2)
    expect(commandWrites(workers[0]).some((w) => w.includes('B'))).toBe(false)
    expect(commandWrites(workers[1]).some((w) => w.includes('B'))).toBe(true)

    workers[1].complete('rb')
    await expect(b).resolves.toBe('rb')
  })

  it('keeps a slow command from blocking later commands head-of-line', async () => {
    const worker = makeFakeWorker()
    const runner = createPersistentRunner(() => worker)

    const a = runner.run('A')
    const b = runner.run('B')
    const c = runner.run('C')

    worker.complete('ra')
    worker.complete('rb')
    worker.complete('rc')

    await expect(Promise.all([a, b, c])).resolves.toEqual(['ra', 'rb', 'rc'])
  })

  it('writes the init script before commands and re-runs it after a restart', async () => {
    const workers = [makeFakeWorker(), makeFakeWorker()]
    let spawnCount = 0
    const spawnWorker = vi.fn(() => workers[spawnCount++])
    const runner = createPersistentRunner(spawnWorker, undefined, 'LOAD_TYPES')

    const first = runner.run('Cmd')
    const initIdx = workers[0].writes.findIndex((w) => w.includes('LOAD_TYPES'))
    const cmdIdx = workers[0].writes.findIndex((w) => w.includes('Cmd'))
    expect(initIdx).toBeGreaterThanOrEqual(0)
    expect(initIdx).toBeLessThan(cmdIdx)
    expect(commandWrites(workers[0]).some((w) => w.includes('LOAD_TYPES'))).toBe(false)
    workers[0].complete('ok')
    await expect(first).resolves.toBe('ok')

    workers[0].emit('exit')
    const second = runner.run('Cmd2')
    expect(workers[1].writes.some((w) => w.includes('LOAD_TYPES'))).toBe(true)
    workers[1].complete('ok2')
    await expect(second).resolves.toBe('ok2')
  })

  it('warm() spawns and initializes the worker before any command is queued', () => {
    const worker = makeFakeWorker()
    const spawnWorker = vi.fn(() => worker)
    const runner = createPersistentRunner(spawnWorker, undefined, () => 'LAZY_INIT')

    runner.warm()
    expect(spawnWorker).toHaveBeenCalledTimes(1)
    expect(worker.writes.some((w) => w.includes('LAZY_INIT'))).toBe(true)
    expect(commandWrites(worker)).toHaveLength(0)
  })
})

describe('quotePowerShellLiteral', () => {
  it('wraps a value in single quotes and doubles an apostrophe', () => {
    expect(quotePowerShellLiteral('Notepad.lnk')).toBe("'Notepad.lnk'")
    expect(quotePowerShellLiteral("O'Brien's Tool.lnk")).toBe("'O''Brien''s Tool.lnk'")
  })

  it('doubles every typographic quote PowerShell also ends a string on', () => {
    expect(quotePowerShellLiteral('O\u2019Brien')).toBe("'O\u2019\u2019Brien'")
    expect(quotePowerShellLiteral('\u2018a\u201Ab\u201B')).toBe("'\u2018\u2018a\u201A\u201Ab\u201B\u201B'")
  })

  it('keeps an injected command inside the string', () => {
    expect(quotePowerShellLiteral('x\u2019; Start-Process calc; \u2019')).toBe("'x\u2019\u2019; Start-Process calc; \u2019\u2019'")
  })

  it('leaves characters that a single-quoted string never expands alone', () => {
    expect(quotePowerShellLiteral('$env:TEMP "x" `n %PATH%')).toBe('\'$env:TEMP "x" `n %PATH%\'')
  })
})

describe('escapePowerShellSingleQuoted', () => {
  it('escapes without adding the surrounding quotes', () => {
    expect(escapePowerShellSingleQuoted("it's \u2019")).toBe("it''s \u2019\u2019")
    expect(escapePowerShellSingleQuoted(42)).toBe('42')
  })
})

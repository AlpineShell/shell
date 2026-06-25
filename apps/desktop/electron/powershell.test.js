import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { createPersistentRunner } from './powershell.js'

const DELIM = '__PS_PERSISTENT_DONE__'

function makeFakeWorker() {
  const worker = new EventEmitter()
  worker.writes = []
  worker.killed = false
  worker.stdout = new EventEmitter()
  worker.stdin = { write: (text) => { worker.writes.push(text); return true } }
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
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { MAX_DEATHS_WITHOUT_REPLY, createWorkerChannel } from './workerChannel.js'

function makeFakeWorker() {
  const worker = new EventEmitter()
  worker.posted = []
  worker.postMessage = (message) => worker.posted.push(message)
  worker.terminate = vi.fn(() => Promise.resolve(0))
  worker.unref = vi.fn()
  worker.reply = (value) => worker.emit('message', { id: worker.posted.at(-1).id, value })
  worker.crash = () => {
    worker.emit('error', new Error('cannot load module'))
    worker.emit('exit', 1)
  }
  return worker
}

function channelOver(workers) {
  let created = 0
  const createWorker = vi.fn(() => workers[created++])
  return { channel: createWorkerChannel({ createWorker, label: 'test' }), createWorker }
}

describe('createWorkerChannel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('resolves with the worker reply', async () => {
    const worker = makeFakeWorker()
    const { channel } = channelOver([worker])

    const result = channel.request({ type: 'read-nodes' }, 2000)
    expect(worker.posted[0]).toMatchObject({ type: 'read-nodes' })
    worker.reply({ nodes: [] })

    await expect(result).resolves.toEqual({ ok: true, value: { nodes: [] } })
  })

  it('resolves a reply that carries an error as a failure', async () => {
    const worker = makeFakeWorker()
    const { channel } = channelOver([worker])

    const result = channel.request({ type: 'read-nodes' }, 2000)
    worker.emit('message', { id: worker.posted[0].id, error: 'boom' })

    await expect(result).resolves.toEqual({ ok: false, error: 'boom' })
  })

  it('times out, terminates the worker and reports the timeout', async () => {
    const worker = makeFakeWorker()
    const { channel } = channelOver([worker])

    const result = channel.request({ type: 'read-nodes' }, 2000)
    await vi.advanceTimersByTimeAsync(2000)

    await expect(result).resolves.toEqual({ ok: false, error: 'timeout' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('refuses work while a timed-out worker is still stuck, then recovers once it exits', async () => {
    const stuck = makeFakeWorker()
    const fresh = makeFakeWorker()
    const { channel, createWorker } = channelOver([stuck, fresh])

    const first = channel.request({ type: 'read-nodes' }, 2000)
    await vi.advanceTimersByTimeAsync(2000)
    await first

    await expect(channel.request({ type: 'read-nodes' }, 2000)).resolves.toEqual({ ok: false, error: 'stuck' })
    expect(createWorker).toHaveBeenCalledTimes(1)

    stuck.emit('exit', 1)
    const next = channel.request({ type: 'read-nodes' }, 2000)
    fresh.reply('ok')

    await expect(next).resolves.toEqual({ ok: true, value: 'ok' })
    expect(createWorker).toHaveBeenCalledTimes(2)
  })

  it('fails pending requests when the worker errors and starts a new one next time', async () => {
    const broken = makeFakeWorker()
    const fresh = makeFakeWorker()
    const { channel, createWorker } = channelOver([broken, fresh])

    const pending = channel.request({ type: 'read-nodes' }, 2000)
    broken.emit('error', new Error('native crash'))
    broken.emit('exit', 1)

    await expect(pending).resolves.toEqual({ ok: false, error: 'worker-error: native crash' })
    channel.request({ type: 'read-nodes' }, 2000)
    expect(createWorker).toHaveBeenCalledTimes(2)
  })

  it('stops creating workers once several in a row die before replying', async () => {
    const workers = Array.from({ length: MAX_DEATHS_WITHOUT_REPLY + 1 }, makeFakeWorker)
    const { channel, createWorker } = channelOver(workers)

    for (const worker of workers.slice(0, MAX_DEATHS_WITHOUT_REPLY)) {
      const pending = channel.request({ type: 'read-nodes' }, 2000)
      worker.crash()
      await pending
    }

    await expect(channel.request({ type: 'read-nodes' }, 2000)).resolves.toEqual({ ok: false, error: 'unavailable' })
    expect(createWorker).toHaveBeenCalledTimes(MAX_DEATHS_WITHOUT_REPLY)
  })

  it('keeps replacing workers that replied before they died', async () => {
    const workers = Array.from({ length: MAX_DEATHS_WITHOUT_REPLY + 1 }, makeFakeWorker)
    const { channel, createWorker } = channelOver(workers)

    for (const worker of workers.slice(0, MAX_DEATHS_WITHOUT_REPLY)) {
      const answered = channel.request({ type: 'read-nodes' }, 2000)
      worker.reply('ok')
      await answered
      worker.crash()
    }
    channel.request({ type: 'read-nodes' }, 2000)

    expect(createWorker).toHaveBeenCalledTimes(MAX_DEATHS_WITHOUT_REPLY + 1)
  })

  it('reports the channel as unavailable when no worker can be created, without retrying', async () => {
    const createWorker = vi.fn(() => {
      throw new Error('no worker_threads')
    })
    const channel = createWorkerChannel({ createWorker, label: 'test' })

    await expect(channel.request({ type: 'read-nodes' }, 2000)).resolves.toEqual({ ok: false, error: 'unavailable' })
    await expect(channel.request({ type: 'read-nodes' }, 2000)).resolves.toEqual({ ok: false, error: 'unavailable' })
    expect(createWorker).toHaveBeenCalledTimes(1)
  })
})

import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { default: devProcess } = await import('./devProcess.js')
const { waitForExit, killProcessTree, stopProcessTree } = devProcess

function fakeChild(pid = 4242) {
  const child = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.signalCode = null
  child.exit = (code = 0) => {
    child.exitCode = code
    child.emit('exit', code, null)
  }
  return child
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('waitForExit', () => {
  it('resolves true at once for a child that already exited', async () => {
    const child = fakeChild()
    child.exitCode = 0
    await expect(waitForExit(child, 1000)).resolves.toBe(true)
  })

  it('resolves true when the child exits in time', async () => {
    const child = fakeChild()
    const exited = waitForExit(child, 1000)
    child.exit()
    await expect(exited).resolves.toBe(true)
  })

  it('resolves false and stops listening when the timeout passes first', async () => {
    const child = fakeChild()
    const exited = waitForExit(child, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(exited).resolves.toBe(false)
    expect(child.listenerCount('exit')).toBe(0)
  })
})

describe('killProcessTree', () => {
  it('force-kills the whole tree of the pid through taskkill', async () => {
    const runFile = vi.fn((_file, _args, _options, done) => done(null))
    await killProcessTree(4242, runFile)
    expect(runFile).toHaveBeenCalledWith('taskkill', ['/T', '/F', '/PID', '4242'], { windowsHide: true }, expect.any(Function))
  })

  it('resolves even when taskkill reports an error', async () => {
    const runFile = vi.fn((_file, _args, _options, done) => done(new Error('not found')))
    await expect(killProcessTree(4242, runFile)).resolves.toBeUndefined()
  })
})

describe('stopProcessTree', () => {
  it('leaves a child that already exited alone', async () => {
    const child = fakeChild()
    child.exitCode = 1
    const requestQuit = vi.fn()
    const killTree = vi.fn()
    await expect(stopProcessTree(child, { requestQuit, timeoutMs: 1000, killTree })).resolves.toBe('exited')
    expect(requestQuit).not.toHaveBeenCalled()
    expect(killTree).not.toHaveBeenCalled()
  })

  it('stops cleanly when the child honours the quit request', async () => {
    const child = fakeChild()
    const requestQuit = vi.fn(() => {
      setTimeout(() => child.exit(), 300)
      return true
    })
    const killTree = vi.fn()
    const stopped = stopProcessTree(child, { requestQuit, timeoutMs: 1000, killTree })
    await vi.advanceTimersByTimeAsync(300)
    await expect(stopped).resolves.toBe('clean')
    expect(requestQuit).toHaveBeenCalledWith(child)
    expect(killTree).not.toHaveBeenCalled()
  })

  it('force-kills the tree when the child ignores the quit request', async () => {
    const child = fakeChild(777)
    const requestQuit = vi.fn(() => true)
    const killTree = vi.fn(async () => child.exit(1))
    const stopped = stopProcessTree(child, { requestQuit, timeoutMs: 1000, killTree })
    await vi.advanceTimersByTimeAsync(999)
    expect(killTree).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(stopped).resolves.toBe('forced')
    expect(killTree).toHaveBeenCalledWith(777)
  })

  it('force-kills at once when the quit request cannot be delivered', async () => {
    const child = fakeChild(888)
    const killTree = vi.fn(async () => child.exit(1))
    await expect(stopProcessTree(child, { requestQuit: () => false, timeoutMs: 1000, killTree })).resolves.toBe('forced')
    expect(killTree).toHaveBeenCalledWith(888)
  })

  it('gives up waiting when even the forced kill does not end the child', async () => {
    const child = fakeChild()
    const killTree = vi.fn(async () => {})
    const stopped = stopProcessTree(child, { requestQuit: () => false, timeoutMs: 1000, killTree })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(stopped).resolves.toBe('forced')
  })
})

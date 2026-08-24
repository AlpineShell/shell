import { describe, it, expect } from 'vitest'
import { singleFlight } from './singleFlight.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('singleFlight', () => {
  it('runs the task once while a call is still in flight', async () => {
    const gate = deferred()
    let calls = 0
    const guarded = singleFlight(() => {
      calls++
      return gate.promise
    })

    const first = guarded()
    const second = guarded()
    const third = guarded()

    expect(calls).toBe(1)
    gate.resolve('devices')
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      'devices',
      'devices',
      'devices',
    ])
    expect(calls).toBe(1)
  })

  it('hands every joined caller the same promise', () => {
    const guarded = singleFlight(() => new Promise(() => {}))
    expect(guarded()).toBe(guarded())
  })

  it('starts a fresh task once the previous one settled', async () => {
    let calls = 0
    const guarded = singleFlight(() => {
      calls++
      return Promise.resolve(calls)
    })

    await expect(guarded()).resolves.toBe(1)
    await expect(guarded()).resolves.toBe(2)
    expect(calls).toBe(2)
  })

  it('releases the guard after a rejection so the next call retries', async () => {
    let calls = 0
    const guarded = singleFlight(() => {
      calls++
      return calls === 1 ? Promise.reject(new Error('scan failed')) : Promise.resolve('ok')
    })

    await expect(guarded()).rejects.toThrow('scan failed')
    await expect(guarded()).resolves.toBe('ok')
  })

  it('accepts a synchronous task', async () => {
    const guarded = singleFlight(() => 'immediate')
    await expect(guarded()).resolves.toBe('immediate')
  })
})

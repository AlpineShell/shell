import { describe, it, expect, vi } from 'vitest'
import periodic from './skippedWhileStillRunning.js'

const { skippedWhileStillRunning } = periodic

describe('skippedWhileStillRunning', () => {
  it('skips a tick while the previous run has not finished', async () => {
    let finish
    const task = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    const tick = skippedWhileStillRunning('test', task)
    const first = tick()
    await tick()
    expect(task).toHaveBeenCalledTimes(1)
    finish()
    await first
    tick()
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('keeps ticking after a run fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const task = vi.fn().mockRejectedValueOnce(new Error('hung')).mockResolvedValue(undefined)
    const tick = skippedWhileStillRunning('test', task)
    await tick()
    await tick()
    expect(task).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })
})

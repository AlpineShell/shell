import { describe, it, expect, vi, afterEach } from 'vitest'

type Deadline = { didTimeout: boolean; timeRemaining: () => number }

async function freshModule() {
  vi.resetModules()
  return import('./emojiRenderable')
}

const originalRequestIdle = window.requestIdleCallback
const originalCancelIdle = window.cancelIdleCallback

function restoreIdle() {
  if (originalRequestIdle) window.requestIdleCallback = originalRequestIdle
  else delete (window as { requestIdleCallback?: unknown }).requestIdleCallback
  if (originalCancelIdle) window.cancelIdleCallback = originalCancelIdle
  else delete (window as { cancelIdleCallback?: unknown }).cancelIdleCallback
}

afterEach(() => {
  vi.restoreAllMocks()
  restoreIdle()
})

describe('warmRenderableEmojis', () => {
  it('schedules the warm on idle with a timeout and returns a cancel', async () => {
    let captured: IdleRequestCallback | null = null
    let capturedOptions: IdleRequestOptions | undefined
    const requestIdle = vi.fn((cb: IdleRequestCallback, options?: IdleRequestOptions) => { captured = cb; capturedOptions = options; return 7 })
    const cancelIdle = vi.fn()
    window.requestIdleCallback = requestIdle
    window.cancelIdleCallback = cancelIdle

    const mod = await freshModule()
    const cancel = mod.warmRenderableEmojis()

    expect(requestIdle).toHaveBeenCalledTimes(1)
    expect(capturedOptions).toEqual({ timeout: 3000 })
    expect(typeof captured).toBe('function')

    cancel()
    expect(cancelIdle).toHaveBeenCalledWith(7)
  })

  it('populates the cache when the idle callback fires, making a later warm a no-op', async () => {
    let captured: IdleRequestCallback | null = null
    const requestIdle = vi.fn((cb: IdleRequestCallback) => { captured = cb; return 1 })
    window.requestIdleCallback = requestIdle
    window.cancelIdleCallback = vi.fn()

    const mod = await freshModule()
    mod.warmRenderableEmojis()
    captured!({ didTimeout: false, timeRemaining: () => 50 } as Deadline)

    expect(mod.getRenderableEmojis().length).toBeGreaterThan(0)

    requestIdle.mockClear()
    mod.warmRenderableEmojis()
    expect(requestIdle).not.toHaveBeenCalled()
  })

  it('falls back to setTimeout when requestIdleCallback is unavailable', async () => {
    delete (window as { requestIdleCallback?: unknown }).requestIdleCallback
    delete (window as { cancelIdleCallback?: unknown }).cancelIdleCallback
    const setSpy = vi.spyOn(window, 'setTimeout')
    const clearSpy = vi.spyOn(window, 'clearTimeout')

    const mod = await freshModule()
    const cancel = mod.warmRenderableEmojis()

    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(setSpy.mock.calls[0][1]).toBe(500)

    cancel()
    expect(clearSpy).toHaveBeenCalled()
  })

  it('does not schedule when the cache is already warm', async () => {
    const requestIdle = vi.fn()
    window.requestIdleCallback = requestIdle
    window.cancelIdleCallback = vi.fn()

    const mod = await freshModule()
    mod.getRenderableEmojis()
    mod.warmRenderableEmojis()

    expect(requestIdle).not.toHaveBeenCalled()
  })
})

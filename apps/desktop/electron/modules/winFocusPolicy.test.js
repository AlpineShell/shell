import { describe, it, expect, vi, afterEach } from 'vitest'
import winFocusPolicy from './winFocusPolicy.js'

const { RESTORE_POLL_MS, MAX_RESTORE_ATTEMPTS, didActivateWindow, createWindowActivator } = winFocusPolicy

const SHELL_THREAD = 10
const PREVIOUS_WINDOW = 100
const PREVIOUS_THREAD = 20
const TARGET_WINDOW = 200
const TARGET_THREAD = 30
const OTHER_WINDOW = 300

function createFakeSystem(overrides = {}) {
  const state = {
    foreground: PREVIOUS_WINDOW,
    existing: new Set([PREVIOUS_WINDOW, TARGET_WINDOW, OTHER_WINDOW]),
    iconic: new Set(),
    hung: new Set(),
    threads: new Map([
      [PREVIOUS_WINDOW, PREVIOUS_THREAD],
      [TARGET_WINDOW, TARGET_THREAD],
      [OTHER_WINDOW, 40],
    ]),
    attached: new Set(),
    directAllowed: true,
    attachedAllowed: true,
    fallbackAllowed: true,
    ...overrides,
  }

  const calls = []

  const ops = {
    isWindow: vi.fn((hwnd) => state.existing.has(hwnd)),
    isIconic: vi.fn((hwnd) => state.iconic.has(hwnd)),
    isHung: vi.fn((hwnd) => state.hung.has(hwnd)),
    getForegroundWindow: vi.fn(() => state.foreground),
    windowThreadId: vi.fn((hwnd) => state.threads.get(hwnd) || 0),
    currentThreadId: vi.fn(() => SHELL_THREAD),
    showRestoreAsync: vi.fn((hwnd) => {
      calls.push(['restore', hwnd])
    }),
    setForegroundWindow: vi.fn((hwnd) => {
      calls.push(['setForeground', hwnd])
      const isAttached = state.attached.size > 0
      const allowed = isAttached ? state.attachedAllowed : state.directAllowed
      if (!allowed || state.iconic.has(hwnd)) return false
      state.foreground = hwnd
      return true
    }),
    raiseWindowAsync: vi.fn((hwnd) => {
      calls.push(['raise', hwnd])
    }),
    attachThreadInput: vi.fn((from, to, attach) => {
      calls.push(['attach', from, to, attach])
      if (attach) {
        if (!state.attachedAllowed) return false
        state.attached.add(`${from}:${to}`)
      } else {
        state.attached.delete(`${from}:${to}`)
      }
      return true
    }),
    allowForegroundFallback: vi.fn((hwnd) => {
      calls.push(['fallback', hwnd])
      if (!state.fallbackAllowed || state.iconic.has(hwnd)) return false
      state.foreground = hwnd
      return true
    }),
  }

  return { state, calls, ops }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('didActivateWindow', () => {
  it('succeeds when the target itself becomes the foreground window', () => {
    expect(didActivateWindow(false, TARGET_WINDOW, PREVIOUS_WINDOW, TARGET_WINDOW)).toBe(true)
  })

  it('succeeds when SetForegroundWindow moved focus to an owned popup of the target', () => {
    expect(didActivateWindow(true, TARGET_WINDOW, PREVIOUS_WINDOW, OTHER_WINDOW)).toBe(true)
  })

  it('rejects a foreground call that left focus on the previous window or nowhere', () => {
    expect(didActivateWindow(true, TARGET_WINDOW, PREVIOUS_WINDOW, PREVIOUS_WINDOW)).toBe(false)
    expect(didActivateWindow(false, TARGET_WINDOW, PREVIOUS_WINDOW, OTHER_WINDOW)).toBe(false)
    expect(didActivateWindow(true, TARGET_WINDOW, PREVIOUS_WINDOW, 0)).toBe(false)
  })
})

describe('createWindowActivator', () => {
  it('ignores invalid or missing windows', () => {
    const { ops } = createFakeSystem()
    const activator = createWindowActivator(ops)

    expect(activator.activateWindow(0)).toBe(0)
    expect(activator.activateWindow(999)).toBe(0)
    expect(ops.setForegroundWindow).not.toHaveBeenCalled()
  })

  it('focuses directly without AttachThreadInput or fallback when direct SetForegroundWindow succeeds', () => {
    const { state, ops } = createFakeSystem({ directAllowed: true })
    const activator = createWindowActivator(ops)

    const token = activator.activateWindow(TARGET_WINDOW)
    expect(token).toBeGreaterThan(0)
    expect(state.foreground).toBe(TARGET_WINDOW)
    expect(ops.setForegroundWindow).toHaveBeenCalledOnce()
    expect(ops.raiseWindowAsync).toHaveBeenCalledWith(TARGET_WINDOW)
    expect(ops.attachThreadInput).not.toHaveBeenCalled()
    expect(ops.allowForegroundFallback).not.toHaveBeenCalled()
  })

  it('uses AttachThreadInput and detaches cleanly without fallback when direct SetForegroundWindow is locked', () => {
    const { state, ops } = createFakeSystem({ directAllowed: false, attachedAllowed: true })
    const activator = createWindowActivator(ops)

    activator.activateWindow(TARGET_WINDOW)
    expect(state.foreground).toBe(TARGET_WINDOW)
    expect(state.attached.size).toBe(0)
    expect(ops.attachThreadInput).toHaveBeenCalledWith(PREVIOUS_THREAD, SHELL_THREAD, true)
    expect(ops.attachThreadInput).toHaveBeenCalledWith(TARGET_THREAD, SHELL_THREAD, true)
    expect(ops.attachThreadInput).toHaveBeenCalledWith(TARGET_THREAD, SHELL_THREAD, false)
    expect(ops.attachThreadInput).toHaveBeenCalledWith(PREVIOUS_THREAD, SHELL_THREAD, false)
    expect(ops.allowForegroundFallback).not.toHaveBeenCalled()
  })

  it('skips attaching to hung windows and falls back to allowForegroundFallback when needed', () => {
    const { state, ops } = createFakeSystem({
      directAllowed: false,
      hung: new Set([PREVIOUS_WINDOW, TARGET_WINDOW]),
    })
    const activator = createWindowActivator(ops)

    activator.activateWindow(TARGET_WINDOW)
    expect(ops.attachThreadInput).not.toHaveBeenCalled()
    expect(ops.allowForegroundFallback).toHaveBeenCalledWith(TARGET_WINDOW)
    expect(state.foreground).toBe(TARGET_WINDOW)
  })

  it('falls back when AttachThreadInput is denied by UIPI', () => {
    const { state, ops } = createFakeSystem({ directAllowed: false, attachedAllowed: false })
    const activator = createWindowActivator(ops)

    activator.activateWindow(TARGET_WINDOW)
    expect(ops.allowForegroundFallback).toHaveBeenCalledWith(TARGET_WINDOW)
    expect(state.foreground).toBe(TARGET_WINDOW)
  })

  it('restores a minimized window asynchronously and focuses it once it stops being iconic', () => {
    vi.useFakeTimers()
    const { state, ops } = createFakeSystem({
      directAllowed: false,
      iconic: new Set([TARGET_WINDOW]),
    })
    const activator = createWindowActivator(ops)

    activator.activateWindow(TARGET_WINDOW)
    expect(ops.showRestoreAsync).toHaveBeenCalledWith(TARGET_WINDOW)
    expect(ops.allowForegroundFallback).not.toHaveBeenCalled()
    expect(state.foreground).toBe(PREVIOUS_WINDOW)

    vi.advanceTimersByTime(RESTORE_POLL_MS)
    expect(state.foreground).toBe(PREVIOUS_WINDOW)

    state.iconic.delete(TARGET_WINDOW)
    vi.advanceTimersByTime(RESTORE_POLL_MS)
    expect(state.foreground).toBe(TARGET_WINDOW)
    expect(ops.allowForegroundFallback).not.toHaveBeenCalled()
  })

  it('does not duplicate restore watchers when the same minimized window is activated again', () => {
    vi.useFakeTimers()
    const { state, ops } = createFakeSystem({ iconic: new Set([TARGET_WINDOW]) })
    const activator = createWindowActivator(ops)

    const firstToken = activator.activateWindow(TARGET_WINDOW)
    const secondToken = activator.activateWindow(TARGET_WINDOW)
    expect(secondToken).toBe(firstToken)
    expect(ops.showRestoreAsync).toHaveBeenCalledOnce()

    state.iconic.delete(TARGET_WINDOW)
    vi.advanceTimersByTime(RESTORE_POLL_MS)
    expect(state.foreground).toBe(TARGET_WINDOW)
  })

  it('cancels a pending restore retry when another window is activated', () => {
    vi.useFakeTimers()
    const { state, ops } = createFakeSystem({ iconic: new Set([TARGET_WINDOW]) })
    const activator = createWindowActivator(ops)

    activator.activateWindow(TARGET_WINDOW)
    activator.activateWindow(OTHER_WINDOW)
    expect(state.foreground).toBe(OTHER_WINDOW)

    state.iconic.delete(TARGET_WINDOW)
    vi.advanceTimersByTime(RESTORE_POLL_MS * MAX_RESTORE_ATTEMPTS)
    expect(state.foreground).toBe(OTHER_WINDOW)
  })

  it('re-focuses via ensureWindowFocused only while the activation token is still current', () => {
    const { state, ops } = createFakeSystem({ directAllowed: false })
    const activator = createWindowActivator(ops)

    const token = activator.activateWindow(TARGET_WINDOW)
    expect(state.foreground).toBe(TARGET_WINDOW)

    state.foreground = PREVIOUS_WINDOW
    expect(activator.ensureWindowFocused(TARGET_WINDOW, token)).toBe(true)
    expect(state.foreground).toBe(TARGET_WINDOW)

    activator.activateWindow(OTHER_WINDOW)
    state.foreground = OTHER_WINDOW
    expect(activator.ensureWindowFocused(TARGET_WINDOW, token)).toBe(false)
    expect(state.foreground).toBe(OTHER_WINDOW)
  })
})

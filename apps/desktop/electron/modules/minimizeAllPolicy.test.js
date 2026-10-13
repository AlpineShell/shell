import { describe, it, expect } from 'vitest'
import minimizeAllPolicy from './minimizeAllPolicy.js'

const { canMinimize, planMinimizeAll, rememberMinimized, planRestore } = minimizeAllPolicy

const EDITOR = 0x101
const BROWSER = 0x102
const TERMINAL = 0x103
const DIALOG = 0x104
const SETTINGS = 0x105

function windowState(hwnd, overrides) {
  return { hwnd, minimized: false, enabled: true, hasMinimizeBox: true, ...overrides }
}

function minimizedAmong(handles) {
  const minimized = new Set(handles)
  return (hwnd) => minimized.has(hwnd)
}

describe('canMinimize', () => {
  it('minimizes an ordinary open window', () => {
    expect(canMinimize(windowState(EDITOR))).toBe(true)
  })

  it('skips a window that is already minimized', () => {
    expect(canMinimize(windowState(EDITOR, { minimized: true }))).toBe(false)
  })

  it('skips a window disabled behind its own modal dialog', () => {
    expect(canMinimize(windowState(EDITOR, { enabled: false }))).toBe(false)
  })

  it('skips a window without a minimize button, like a dialog', () => {
    expect(canMinimize(windowState(DIALOG, { hasMinimizeBox: false }))).toBe(false)
  })
})

describe('planMinimizeAll', () => {
  it('remembers the minimized windows top first and minimizes them bottom first', () => {
    const plan = planMinimizeAll([windowState(EDITOR), windowState(BROWSER), windowState(TERMINAL)])
    expect(plan.remember).toEqual([EDITOR, BROWSER, TERMINAL])
    expect(plan.minimizeOrder).toEqual([TERMINAL, BROWSER, EDITOR])
  })

  it('leaves out windows it cannot minimize', () => {
    const plan = planMinimizeAll([
      windowState(EDITOR),
      windowState(DIALOG, { hasMinimizeBox: false }),
      windowState(BROWSER, { minimized: true }),
      windowState(TERMINAL),
    ])
    expect(plan.remember).toEqual([EDITOR, TERMINAL])
    expect(plan.minimizeOrder).toEqual([TERMINAL, EDITOR])
  })

  it('has nothing to do on an empty desktop', () => {
    expect(planMinimizeAll([])).toEqual({ remember: [], minimizeOrder: [] })
  })

  it('does not reorder the list it was given', () => {
    const windows = [windowState(EDITOR), windowState(BROWSER)]
    planMinimizeAll(windows)
    expect(windows.map((window) => window.hwnd)).toEqual([EDITOR, BROWSER])
  })
})

describe('rememberMinimized', () => {
  it('remembers what this Win+M minimized', () => {
    expect(rememberMinimized([], [EDITOR, BROWSER], () => true)).toEqual([EDITOR, BROWSER])
  })

  it('keeps windows an earlier Win+M minimized that are still minimized, below the new ones', () => {
    const remembered = rememberMinimized([EDITOR, BROWSER], [SETTINGS], minimizedAmong([EDITOR, BROWSER]))
    expect(remembered).toEqual([SETTINGS, EDITOR, BROWSER])
  })

  it('drops earlier windows that were restored or closed since', () => {
    const remembered = rememberMinimized([EDITOR, BROWSER], [SETTINGS], minimizedAmong([BROWSER]))
    expect(remembered).toEqual([SETTINGS, BROWSER])
  })

  it('lists a window once when the user restored it and Win+M minimized it again', () => {
    const remembered = rememberMinimized([EDITOR, BROWSER], [EDITOR], minimizedAmong([BROWSER]))
    expect(remembered).toEqual([EDITOR, BROWSER])
  })
})

describe('planRestore', () => {
  it('restores the lower windows bottom first and activates the one that was on top', () => {
    const plan = planRestore([EDITOR, BROWSER, TERMINAL], () => true)
    expect(plan).toEqual({ restoreOrder: [TERMINAL, BROWSER], activate: EDITOR })
  })

  it('skips windows that were restored by hand or closed since', () => {
    const plan = planRestore([EDITOR, BROWSER, TERMINAL], minimizedAmong([BROWSER, TERMINAL]))
    expect(plan).toEqual({ restoreOrder: [TERMINAL], activate: BROWSER })
  })

  it('only activates when a single window is left to bring back', () => {
    expect(planRestore([EDITOR], () => true)).toEqual({ restoreOrder: [], activate: EDITOR })
  })

  it('does nothing when Win+M has not minimized anything', () => {
    expect(planRestore([], () => true)).toEqual({ restoreOrder: [], activate: null })
  })

  it('does nothing when every remembered window is back already', () => {
    expect(planRestore([EDITOR, BROWSER], () => false)).toEqual({ restoreOrder: [], activate: null })
  })

  it('does not reorder the remembered list', () => {
    const remembered = [EDITOR, BROWSER, TERMINAL]
    planRestore(remembered, () => true)
    expect(remembered).toEqual([EDITOR, BROWSER, TERMINAL])
  })
})

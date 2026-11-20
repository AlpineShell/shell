import { describe, it, expect } from 'vitest'
import virtualDesktopsPolicy from './virtualDesktopsPolicy.js'

const {
  MAX_DESKTOPS,
  initialDesktops,
  desktopsSummary,
  adjacentDesktop,
  planSwitch,
  planAddDesktop,
  planCloseDesktop,
  planMoveWindow,
  allStashedWindows,
  windowsToRecover,
  restoreSwapState,
} = virtualDesktopsPolicy

const EDITOR = { hwnd: 0x101, processId: 11 }
const BROWSER = { hwnd: 0x102, processId: 12 }
const TERMINAL = { hwnd: 0x103, processId: 13 }
const MUSIC = { hwnd: 0x104, processId: 14 }

const alive = () => true

function desktops(stashed, current) {
  return { stashed, current }
}

describe('initialDesktops', () => {
  it('starts with one desktop that is current', () => {
    expect(desktopsSummary(initialDesktops())).toEqual({ count: 1, current: 0 })
  })
})

describe('adjacentDesktop', () => {
  it('finds the desktop to either side', () => {
    const state = desktops([[], [], []], 1)
    expect(adjacentDesktop(state, 'left')).toBe(0)
    expect(adjacentDesktop(state, 'right')).toBe(2)
  })

  it('stops at the first and the last desktop instead of wrapping', () => {
    expect(adjacentDesktop(desktops([[], []], 0), 'left')).toBe(null)
    expect(adjacentDesktop(desktops([[], []], 1), 'right')).toBe(null)
  })
})

describe('planSwitch', () => {
  it('hides the windows on screen and shows the target desktop bottom first', () => {
    const plan = planSwitch(desktops([[], [TERMINAL, MUSIC]], 0), 1, [EDITOR, BROWSER], alive)
    expect(plan.hide).toEqual([EDITOR.hwnd, BROWSER.hwnd])
    expect(plan.show).toEqual([MUSIC.hwnd, TERMINAL.hwnd])
    expect(plan.activate).toBe(TERMINAL.hwnd)
    expect(plan.state).toEqual(desktops([[EDITOR, BROWSER], []], 1))
  })

  it('activates nothing when the target desktop is empty', () => {
    const plan = planSwitch(desktops([[], []], 0), 1, [EDITOR], alive)
    expect(plan.show).toEqual([])
    expect(plan.activate).toBe(null)
  })

  it('keeps a window on the desktop where it is on screen now', () => {
    const plan = planSwitch(desktops([[], [EDITOR, TERMINAL]], 0), 1, [EDITOR], alive)
    expect(plan.show).toEqual([TERMINAL.hwnd])
    expect(plan.state.stashed[0]).toEqual([EDITOR])
  })

  it('forgets windows that were closed while their desktop was away', () => {
    const plan = planSwitch(desktops([[], [TERMINAL, MUSIC]], 0), 1, [], (window) => window !== MUSIC)
    expect(plan.show).toEqual([TERMINAL.hwnd])
  })

  it('does nothing for the current desktop or one that does not exist', () => {
    const state = desktops([[], []], 0)
    expect(planSwitch(state, 0, [EDITOR], alive)).toBe(null)
    expect(planSwitch(state, 2, [EDITOR], alive)).toBe(null)
    expect(planSwitch(state, -1, [EDITOR], alive)).toBe(null)
  })

  it('does not change the state it was given', () => {
    const state = desktops([[], [TERMINAL]], 0)
    planSwitch(state, 1, [EDITOR], alive)
    expect(state).toEqual(desktops([[], [TERMINAL]], 0))
  })
})

describe('planAddDesktop', () => {
  it('adds an empty desktop at the end and stays on the current one', () => {
    expect(planAddDesktop(desktops([[]], 0))).toEqual(desktops([[], []], 0))
  })

  it(`stops at ${MAX_DESKTOPS} desktops`, () => {
    const full = desktops(Array.from({ length: MAX_DESKTOPS }, () => []), 0)
    expect(planAddDesktop(full)).toBe(null)
  })
})

describe('planCloseDesktop', () => {
  it('moves the windows of the closed desktop onto the one to its left', () => {
    const plan = planCloseDesktop(desktops([[TERMINAL, MUSIC], []], 1), 1, [EDITOR], alive)
    expect(plan.hide).toEqual([])
    expect(plan.show).toEqual([MUSIC.hwnd, TERMINAL.hwnd])
    expect(plan.activate).toBe(EDITOR.hwnd)
    expect(plan.state).toEqual(desktops([[]], 0))
  })

  it('moves them onto the next desktop when the first one closes', () => {
    const plan = planCloseDesktop(desktops([[], [TERMINAL], [MUSIC]], 0), 0, [EDITOR], alive)
    expect(plan.show).toEqual([TERMINAL.hwnd])
    expect(plan.state).toEqual(desktops([[], [MUSIC]], 0))
  })

  it('activates the top window of the neighbour when the closed desktop was empty', () => {
    const plan = planCloseDesktop(desktops([[TERMINAL], []], 1), 1, [], alive)
    expect(plan.activate).toBe(TERMINAL.hwnd)
  })

  it('never closes the last desktop', () => {
    expect(planCloseDesktop(desktops([[]], 0), 0, [EDITOR], alive)).toBe(null)
  })

  it('closes a desktop it is not on and moves its windows onto the one to its left, still hidden', () => {
    const plan = planCloseDesktop(desktops([[], [TERMINAL], [MUSIC]], 0), 2, [EDITOR], alive)
    expect(plan.hide).toEqual([])
    expect(plan.show).toEqual([])
    expect(plan.activate).toBe(null)
    expect(plan.state).toEqual(desktops([[], [TERMINAL, MUSIC]], 0))
  })

  it('shows the windows of a closed desktop when they land on the current one, without taking focus', () => {
    const plan = planCloseDesktop(desktops([[], [TERMINAL, MUSIC]], 0), 1, [EDITOR], alive)
    expect(plan.show).toEqual([MUSIC.hwnd, TERMINAL.hwnd])
    expect(plan.activate).toBe(null)
    expect(plan.state).toEqual(desktops([[]], 0))
  })

  it('keeps the current desktop current when one before it closes', () => {
    const plan = planCloseDesktop(desktops([[TERMINAL], [MUSIC], []], 2), 0, [EDITOR], alive)
    expect(plan.state).toEqual(desktops([[MUSIC, TERMINAL], []], 1))
    expect(plan.show).toEqual([])
  })

  it('does nothing for a desktop that does not exist', () => {
    expect(planCloseDesktop(desktops([[], []], 0), 2, [EDITOR], alive)).toBe(null)
    expect(planCloseDesktop(desktops([[], []], 0), 'x', [EDITOR], alive)).toBe(null)
  })
})

describe('planMoveWindow', () => {
  it('carries the window to the next desktop, follows it and puts it on top', () => {
    const plan = planMoveWindow(desktops([[], [TERMINAL]], 0), EDITOR, 'right', [EDITOR, BROWSER], alive)
    expect(plan.hide).toEqual([EDITOR.hwnd, BROWSER.hwnd])
    expect(plan.show).toEqual([TERMINAL.hwnd, EDITOR.hwnd])
    expect(plan.activate).toBe(EDITOR.hwnd)
    expect(plan.state).toEqual(desktops([[BROWSER], []], 1))
  })

  it('does nothing at the edge of the desktops', () => {
    expect(planMoveWindow(desktops([[], []], 0), EDITOR, 'left', [EDITOR], alive)).toBe(null)
  })

  it('does nothing for a window that is not on screen', () => {
    expect(planMoveWindow(desktops([[], []], 0), MUSIC, 'right', [EDITOR], alive)).toBe(null)
    expect(planMoveWindow(desktops([[], []], 0), null, 'right', [EDITOR], alive)).toBe(null)
  })
})

describe('allStashedWindows', () => {
  it('lists every window hidden on another desktop', () => {
    expect(allStashedWindows(desktops([[EDITOR], [], [TERMINAL, MUSIC]], 1))).toEqual([EDITOR, TERMINAL, MUSIC])
  })
})

describe('windowsToRecover', () => {
  function probe({ gone = [], visible = [], reused = [] } = {}) {
    return {
      exists: (hwnd) => !gone.includes(hwnd),
      isVisible: (hwnd) => visible.includes(hwnd),
      processId: (hwnd) => (reused.includes(hwnd) ? 999 : [EDITOR, BROWSER, TERMINAL, MUSIC].find((window) => window.hwnd === hwnd).processId),
    }
  }

  it('brings back the windows a previous run left hidden', () => {
    expect(windowsToRecover([EDITOR, BROWSER], probe())).toEqual([EDITOR.hwnd, BROWSER.hwnd])
  })

  it('skips windows that closed, are on screen already or whose handle now belongs to another process', () => {
    const saved = [EDITOR, BROWSER, TERMINAL, MUSIC]
    const found = probe({ gone: [EDITOR.hwnd], visible: [BROWSER.hwnd], reused: [TERMINAL.hwnd] })
    expect(windowsToRecover(saved, found)).toEqual([MUSIC.hwnd])
  })

  it('ignores a file that is not a list of windows', () => {
    expect(windowsToRecover(null, probe())).toEqual([])
    expect(windowsToRecover([null, { hwnd: 'x' }, 7], probe())).toEqual([])
  })
})

describe('restoreSwapState', () => {
  function probe({ gone = [], visible = [], reused = [] } = {}) {
    return {
      exists: (hwnd) => !gone.includes(hwnd),
      isVisible: (hwnd) => visible.includes(hwnd),
      processId: (hwnd) => (reused.includes(hwnd) ? 999 : [EDITOR, BROWSER, TERMINAL, MUSIC].find((window) => window.hwnd === hwnd).processId),
    }
  }

  it('restores the active desktop and hidden windows while pruning gone, visible or reused handles', () => {
    const saved = desktops([[EDITOR, BROWSER], [], [TERMINAL, MUSIC]], 1)
    const restored = restoreSwapState(saved, probe({ gone: [BROWSER.hwnd], reused: [MUSIC.hwnd] }))
    expect(restored).toEqual(desktops([[EDITOR], [], [TERMINAL]], 1))
  })

  it('returns null for missing or malformed swap state', () => {
    expect(restoreSwapState(null, probe())).toBeNull()
    expect(restoreSwapState({ stashed: [], current: 0 }, probe())).toBeNull()
  })
})

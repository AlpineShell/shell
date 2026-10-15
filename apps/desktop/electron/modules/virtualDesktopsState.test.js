import { describe, it, expect } from 'vitest'
import virtualDesktopsState from './virtualDesktopsState.js'

const {
  MAX_DESKTOPS,
  createDesktopsState,
  savedDesktops,
  adjacentDesktopId,
  hiddenWindows,
  planSwitch,
  planCreate,
  planRemove,
  planMoveWindow,
  renameDesktop,
  forgetClosedWindows,
  summarizeDesktops,
} = virtualDesktopsState

const EDITOR = 101
const BROWSER = 102
const MUSIC = 103

function twoDesktops() {
  return planCreate(createDesktopsState(null)).state
}

describe('createDesktopsState', () => {
  it('starts with one desktop when nothing was saved', () => {
    const state = createDesktopsState(null)
    expect(state.desktops).toEqual([{ id: 'desktop-1', name: 'Desktop 1' }])
    expect(state.currentId).toBe('desktop-1')
  })

  it('restores saved desktops and their names, starting on the first one', () => {
    const state = createDesktopsState({ desktops: [{ id: 'desktop-1', name: 'Work' }, { id: 'desktop-4', name: 'Games' }], nextNumber: 5 })
    expect(state.desktops.map((desktop) => desktop.name)).toEqual(['Work', 'Games'])
    expect(state.currentId).toBe('desktop-1')
    expect(planCreate(state).id).toBe('desktop-5')
  })

  it('never reuses an id even when the saved counter is behind', () => {
    const state = createDesktopsState({ desktops: [{ id: 'desktop-7', name: 'A' }], nextNumber: 2 })
    expect(planCreate(state).id).toBe('desktop-8')
  })

  it('ignores broken saved entries', () => {
    expect(createDesktopsState({ desktops: [null, { id: '' }, 'x'] }).desktops).toHaveLength(1)
  })

  it('saves only the desktops and the id counter, never window handles', () => {
    const state = planSwitch(twoDesktops(), 'desktop-2', [EDITOR], EDITOR).state
    expect(Object.keys(savedDesktops(state))).toEqual(['desktops', 'nextNumber'])
  })
})

describe('planSwitch', () => {
  it('hides what is open here and shows what belongs to the other desktop', () => {
    const first = planSwitch(twoDesktops(), 'desktop-2', [EDITOR, BROWSER], BROWSER)
    expect(first.hide).toEqual([EDITOR, BROWSER])
    expect(first.show).toEqual([])
    expect(first.state.currentId).toBe('desktop-2')

    const back = planSwitch(first.state, 'desktop-1', [MUSIC], MUSIC)
    expect(back.hide).toEqual([MUSIC])
    expect(back.show.sort()).toEqual([EDITOR, BROWSER])
  })

  it('gives focus back to the window that had it when you left', () => {
    const away = planSwitch(twoDesktops(), 'desktop-2', [EDITOR, BROWSER], BROWSER)
    expect(planSwitch(away.state, 'desktop-1', [], 0).focus).toBe(BROWSER)
  })

  it('does not bring back a window its own app hid while you were on its desktop', () => {
    const away = planSwitch(twoDesktops(), 'desktop-2', [EDITOR, MUSIC], EDITOR)
    const home = planSwitch(away.state, 'desktop-1', [], 0)
    const awayAgain = planSwitch(home.state, 'desktop-2', [EDITOR], EDITOR)
    expect(planSwitch(awayAgain.state, 'desktop-1', [], 0).show).toEqual([EDITOR])
  })

  it('does nothing for the current desktop or one that does not exist', () => {
    expect(planSwitch(twoDesktops(), 'desktop-1', [EDITOR], EDITOR)).toBeNull()
    expect(planSwitch(twoDesktops(), 'desktop-9', [EDITOR], EDITOR)).toBeNull()
  })

  it('lists the windows waiting on other desktops so they can be shown again after a crash', () => {
    const away = planSwitch(twoDesktops(), 'desktop-2', [EDITOR, BROWSER], EDITOR)
    expect(hiddenWindows(away.state).sort()).toEqual([EDITOR, BROWSER])
  })
})

describe('adjacentDesktopId', () => {
  it('steps to the neighbour and stops at the ends, like Windows', () => {
    const state = twoDesktops()
    expect(adjacentDesktopId(state, 'next')).toBe('desktop-2')
    expect(adjacentDesktopId(state, 'previous')).toBeNull()
  })
})

describe('planCreate', () => {
  it('names a new desktop after its place in the row', () => {
    const { state, id } = planCreate(createDesktopsState(null))
    expect(id).toBe('desktop-2')
    expect(state.desktops.at(-1)).toEqual({ id: 'desktop-2', name: 'Desktop 2' })
  })

  it(`stops at ${MAX_DESKTOPS} desktops`, () => {
    let state = createDesktopsState(null)
    while (state.desktops.length < MAX_DESKTOPS) state = planCreate(state).state
    expect(planCreate(state)).toBeNull()
    expect(summarizeDesktops(state, 0).canCreate).toBe(false)
  })
})

describe('planRemove', () => {
  it('moves the windows of a closed background desktop onto the current one', () => {
    let state = planCreate(twoDesktops()).state
    state = planSwitch(state, 'desktop-3', [EDITOR], EDITOR).state
    state = planSwitch(state, 'desktop-2', [BROWSER], BROWSER).state
    const removed = planRemove(state, 'desktop-3', [], 0)
    expect(removed.show).toEqual([BROWSER])
    expect(removed.state.desktops.map((desktop) => desktop.id)).toEqual(['desktop-1', 'desktop-2'])
  })

  it('closing the current desktop switches to its neighbour and brings its windows along', () => {
    const away = planSwitch(twoDesktops(), 'desktop-2', [EDITOR], EDITOR)
    const removed = planRemove(away.state, 'desktop-2', [MUSIC], MUSIC)
    expect(removed.state.currentId).toBe('desktop-1')
    expect(removed.hide).toEqual([MUSIC])
    expect(removed.show.sort()).toEqual([EDITOR, MUSIC])
    expect(hiddenWindows(removed.state)).toEqual([])
  })

  it('keeps the last desktop', () => {
    expect(planRemove(createDesktopsState(null), 'desktop-1', [], 0)).toBeNull()
  })
})

describe('planMoveWindow', () => {
  it('hides the window and remembers it as the one to focus over there', () => {
    const moved = planMoveWindow(twoDesktops(), EDITOR, 'desktop-2')
    expect(moved.hide).toEqual([EDITOR])
    expect(planSwitch(moved.state, 'desktop-2', [], 0)).toMatchObject({ show: [EDITOR], focus: EDITOR })
  })

  it('does nothing when the window is already on that desktop', () => {
    expect(planMoveWindow(twoDesktops(), EDITOR, 'desktop-1')).toBeNull()
  })
})

describe('renameDesktop', () => {
  it('trims the name and falls back to the default when it is empty', () => {
    expect(renameDesktop(twoDesktops(), 'desktop-2', '  Work  ').desktops[1].name).toBe('Work')
    expect(renameDesktop(twoDesktops(), 'desktop-2', '   ').desktops[1].name).toBe('Desktop 2')
    expect(renameDesktop(twoDesktops(), 'desktop-2', 'x'.repeat(80)).desktops[1].name).toHaveLength(32)
  })
})

describe('forgetClosedWindows and summarizeDesktops', () => {
  it('drops windows that no longer exist and counts the rest per desktop', () => {
    const away = planSwitch(twoDesktops(), 'desktop-2', [EDITOR, BROWSER], EDITOR).state
    const pruned = forgetClosedWindows(away, (hwnd) => hwnd !== BROWSER)
    expect(summarizeDesktops(pruned, 3)).toEqual({
      currentId: 'desktop-2',
      canCreate: true,
      desktops: [
        { id: 'desktop-1', name: 'Desktop 1', windowCount: 1 },
        { id: 'desktop-2', name: 'Desktop 2', windowCount: 3 },
      ],
    })
  })
})

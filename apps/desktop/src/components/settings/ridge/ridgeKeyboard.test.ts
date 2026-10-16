import { describe, it, expect } from 'vitest'
import { EMPTY_TOPBAR_LAYOUT, resolveTopbarLayout, topbarSlotItems } from '../../topbar/layout/topbarLayout'
import { moveTopbarItem } from '../../topbar/layout/topbarLayoutEdits'
import {
  nextFocusedItem,
  refusingSlotForStep,
  ridgeFocusOrder,
  ridgeKeyIntent,
  stepGrabbedPosition,
} from './ridgeKeyboard'

const DEFAULT_ITEMS = resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT)
const BAR_ORDER: TopbarItemId[] = [
  'system-menu',
  'plugins-left',
  'desktops',
  'launcher',
  'tray',
  'media',
  'microphone',
  'status',
  'plugins-right',
  'clock',
]
const PLUGINS_LEFT_LAST = moveTopbarItem(DEFAULT_ITEMS, 'plugins-left', { slot: 'left', index: 2 })
const PLUGINS_LEFT_FIRST = moveTopbarItem(DEFAULT_ITEMS, 'plugins-left', { slot: 'left', index: 0 })
const PLUGINS_RIGHT_FIRST = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'right', index: 0 })
const PLUGINS_RIGHT_LAST = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'right', index: 5 })

const press = (key: string, modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>> = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...modifiers,
})
const idsInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) => topbarSlotItems(items, slot).map((item) => item.id)
const withHidden = (...ids: TopbarItemId[]) =>
  resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ids })

describe('ridgeKeyIntent', () => {
  it.each<[string, RidgeKeyIntent, RidgeKeyIntent]>([
    [' ', { kind: 'grab' }, { kind: 'drop' }],
    ['Spacebar', { kind: 'grab' }, { kind: 'drop' }],
    ['Enter', { kind: 'native' }, { kind: 'drop' }],
    ['Escape', { kind: 'native' }, { kind: 'cancel' }],
    ['Delete', { kind: 'hide' }, { kind: 'hide' }],
    ['Backspace', { kind: 'hide' }, { kind: 'hide' }],
    ['ArrowLeft', { kind: 'focus', step: 'earlier' }, { kind: 'move', step: 'earlier' }],
    ['ArrowUp', { kind: 'focus', step: 'earlier' }, { kind: 'move', step: 'earlier' }],
    ['ArrowRight', { kind: 'focus', step: 'later' }, { kind: 'move', step: 'later' }],
    ['ArrowDown', { kind: 'focus', step: 'later' }, { kind: 'move', step: 'later' }],
    ['Home', { kind: 'focus', step: 'first' }, { kind: 'move', step: 'first' }],
    ['End', { kind: 'focus', step: 'last' }, { kind: 'move', step: 'last' }],
    ['Tab', { kind: 'native' }, { kind: 'native' }],
    ['a', { kind: 'native' }, { kind: 'native' }],
    ['constructor', { kind: 'native' }, { kind: 'native' }],
  ])('maps "%s" while idle and while an item is picked up', (key, idle, grabbed) => {
    expect(ridgeKeyIntent(press(key), false)).toEqual(idle)
    expect(ridgeKeyIntent(press(key), true)).toEqual(grabbed)
  })

  it('drops on Enter only while an item is picked up, so a plain Enter stays a button click', () => {
    expect(ridgeKeyIntent(press('Enter'), false)).toEqual({ kind: 'native' })
    expect(ridgeKeyIntent(press('Enter'), true)).toEqual({ kind: 'drop' })
  })

  it('leaves key combinations to the system', () => {
    expect(ridgeKeyIntent(press('ArrowRight', { ctrlKey: true }), true)).toEqual({ kind: 'native' })
    expect(ridgeKeyIntent(press('ArrowLeft', { altKey: true }), false)).toEqual({ kind: 'native' })
    expect(ridgeKeyIntent(press(' ', { metaKey: true }), false)).toEqual({ kind: 'native' })
    expect(ridgeKeyIntent(press('Enter', { ctrlKey: true }), true)).toEqual({ kind: 'native' })
  })
})

describe('ridgeFocusOrder', () => {
  it('walks the visible items in bar order, left to right', () => {
    expect(ridgeFocusOrder(DEFAULT_ITEMS)).toEqual(BAR_ORDER)
  })

  it('skips hidden items', () => {
    expect(ridgeFocusOrder(withHidden('media', 'launcher'))).toEqual(
      BAR_ORDER.filter((id) => id !== 'media' && id !== 'launcher')
    )
  })

  it('follows an item that moved to another side', () => {
    const clockInCenter = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 1 })

    expect(ridgeFocusOrder(clockInCenter).slice(1, 6)).toEqual(['plugins-left', 'desktops', 'launcher', 'clock', 'tray'])
  })
})

describe('nextFocusedItem', () => {
  it('moves one item along, crossing sides', () => {
    expect(nextFocusedItem(BAR_ORDER, 'desktops', 'later')).toBe('launcher')
    expect(nextFocusedItem(BAR_ORDER, 'launcher', 'earlier')).toBe('desktops')
  })

  it('stops at the ends instead of wrapping', () => {
    expect(nextFocusedItem(BAR_ORDER, 'system-menu', 'earlier')).toBe('system-menu')
    expect(nextFocusedItem(BAR_ORDER, 'clock', 'later')).toBe('clock')
  })

  it('jumps to the first and the last item', () => {
    expect(nextFocusedItem(BAR_ORDER, 'media', 'first')).toBe('system-menu')
    expect(nextFocusedItem(BAR_ORDER, 'media', 'last')).toBe('clock')
  })

  it('starts from the first item when the current one no longer shows', () => {
    const withoutLauncher = BAR_ORDER.filter((id) => id !== 'launcher')

    expect(nextFocusedItem(withoutLauncher, 'launcher', 'later')).toBe('system-menu')
  })

  it('returns null when nothing shows', () => {
    expect(nextFocusedItem([], 'clock', 'later')).toBeNull()
  })
})

describe('stepGrabbedPosition', () => {
  it('moves one place later, crossing into the next side', () => {
    const moved = stepGrabbedPosition(DEFAULT_ITEMS, 'launcher', 'later')

    expect(idsInSlot(moved, 'center')).toEqual([])
    expect(idsInSlot(moved, 'right')).toEqual(['launcher', 'tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'])
  })

  it('moves one place earlier, crossing into the previous side', () => {
    expect(idsInSlot(stepGrabbedPosition(DEFAULT_ITEMS, 'tray', 'earlier'), 'center')).toEqual(['launcher', 'tray'])
  })

  it('moves to the start or the end of its own side', () => {
    expect(idsInSlot(stepGrabbedPosition(DEFAULT_ITEMS, 'clock', 'first'), 'right')).toEqual([
      'clock',
      'tray',
      'media',
      'microphone',
      'status',
      'plugins-right',
    ])
    expect(idsInSlot(stepGrabbedPosition(DEFAULT_ITEMS, 'tray', 'last'), 'right')).toEqual([
      'media',
      'microphone',
      'status',
      'plugins-right',
      'clock',
      'tray',
    ])
  })

  it('returns the same items when it cannot move', () => {
    expect(stepGrabbedPosition(DEFAULT_ITEMS, 'system-menu', 'earlier')).toBe(DEFAULT_ITEMS)
    expect(stepGrabbedPosition(DEFAULT_ITEMS, 'system-menu', 'first')).toBe(DEFAULT_ITEMS)
    expect(stepGrabbedPosition(DEFAULT_ITEMS, 'clock', 'later')).toBe(DEFAULT_ITEMS)
    expect(stepGrabbedPosition(DEFAULT_ITEMS, 'clock', 'last')).toBe(DEFAULT_ITEMS)
  })

  it('carries a plugin group into the neighbouring side like any other item', () => {
    expect(idsInSlot(stepGrabbedPosition(PLUGINS_LEFT_LAST, 'plugins-left', 'later'), 'center')).toEqual([
      'plugins-left',
      'launcher',
    ])
    expect(idsInSlot(stepGrabbedPosition(PLUGINS_RIGHT_FIRST, 'plugins-right', 'earlier'), 'center')).toEqual([
      'launcher',
      'plugins-right',
    ])
  })
})

describe('refusingSlotForStep', () => {
  it('lets a plugin group step off the end of its side into the center', () => {
    expect(refusingSlotForStep(PLUGINS_LEFT_LAST, 'plugins-left', 'later')).toBeNull()
    expect(refusingSlotForStep(PLUGINS_RIGHT_FIRST, 'plugins-right', 'earlier')).toBeNull()
  })

  it('refuses nothing while the plugin group still has room on its side', () => {
    expect(refusingSlotForStep(DEFAULT_ITEMS, 'plugins-left', 'later')).toBeNull()
    expect(refusingSlotForStep(DEFAULT_ITEMS, 'plugins-right', 'later')).toBeNull()
  })

  it('refuses nothing at the outer ends of the bar', () => {
    expect(refusingSlotForStep(PLUGINS_LEFT_FIRST, 'plugins-left', 'earlier')).toBeNull()
    expect(refusingSlotForStep(PLUGINS_RIGHT_LAST, 'plugins-right', 'later')).toBeNull()
  })

  it('never refuses an element', () => {
    expect(refusingSlotForStep(DEFAULT_ITEMS, 'launcher', 'later')).toBeNull()
    expect(refusingSlotForStep(DEFAULT_ITEMS, 'tray', 'earlier')).toBeNull()
  })

  it('refuses nothing for Home and End, which stay on the same side', () => {
    expect(refusingSlotForStep(PLUGINS_LEFT_LAST, 'plugins-left', 'last')).toBeNull()
    expect(refusingSlotForStep(PLUGINS_RIGHT_FIRST, 'plugins-right', 'first')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import {
  EMPTY_TOPBAR_LAYOUT,
  TOPBAR_SLOTS,
  resolveTopbarLayout,
  storeTopbarLayout,
  topbarSlotAcceptsItem,
  topbarSlotItems,
  visibleTopbarSlotItems,
} from './topbarLayout'
import {
  isDefaultTopbarArrangement,
  moveTopbarItem,
  setTopbarItemVisible,
  stepTopbarItem,
  stepTopbarItemPast,
  topbarItemPosition,
  topbarItemTargets,
} from './topbarLayoutEdits'

const DEFAULT_ITEMS = resolveTopbarLayout(null)

const idsInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) => topbarSlotItems(items, slot).map((item) => item.id)
const visibleIdsInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) =>
  visibleTopbarSlotItems(items, slot).map((item) => item.id)
const ordersInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) =>
  topbarSlotItems(items, slot).map((item) => item.order)
const withHidden = (...ids: TopbarItemId[]) =>
  resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ids })
const itemById = (items: TopbarLayoutItem[], id: TopbarItemId) => items.find((item) => item.id === id)
const acceptedSlots = (id: TopbarItemId) => TOPBAR_SLOTS.filter((slot) => topbarSlotAcceptsItem(slot, id))

function walkLater(items: TopbarLayoutItem[], id: TopbarItemId): TopbarItemTarget[] {
  const visited: TopbarItemTarget[] = []
  let current = items
  for (;;) {
    const position = topbarItemPosition(current, id)
    if (position) visited.push(position)
    const next = stepTopbarItem(current, id, 'later')
    if (next === current) return visited
    current = next
  }
}

describe('stepTopbarItemPast', () => {
  const pluginsRightUndrawn = (id: TopbarItemId) => id !== 'plugins-right'

  it('steps like stepTopbarItem when every item is drawn', () => {
    expect(stepTopbarItemPast(DEFAULT_ITEMS, 'clock', 'earlier')).toEqual(stepTopbarItem(DEFAULT_ITEMS, 'clock', 'earlier'))
  })

  it('keeps stepping past an item that is not drawn until the move shows', () => {
    const stepped = stepTopbarItemPast(DEFAULT_ITEMS, 'clock', 'earlier', pluginsRightUndrawn)
    expect(idsInSlot(stepped, 'right')).toEqual(['tray', 'media', 'microphone', 'clock', 'status', 'plugins-right'])
  })

  it('leaves the layout as it is when only undrawn items are in the way', () => {
    const clockBeforePlugins = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'right', index: 4 })
    expect(idsInSlot(clockBeforePlugins, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'clock', 'plugins-right'])
    expect(stepTopbarItemPast(clockBeforePlugins, 'clock', 'later', pluginsRightUndrawn)).toBe(clockBeforePlugins)
  })
})

describe('the slots an item may go to', () => {
  it('lets an element and a plugin group alike into every slot', () => {
    expect(acceptedSlots('clock')).toEqual(['left', 'center', 'right'])
    expect(acceptedSlots('plugins-left')).toEqual(['left', 'center', 'right'])
    expect(acceptedSlots('plugins-right')).toEqual(['left', 'center', 'right'])
  })
})

describe('moveTopbarItem', () => {
  it('reorders an item within its slot', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'right', index: 0 })
    expect(idsInSlot(moved, 'right')).toEqual(['clock', 'tray', 'media', 'microphone', 'status', 'plugins-right'])
  })

  it('treats the index as the place the item ends up, even when it moves later', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'tray', { slot: 'right', index: 2 })
    expect(idsInSlot(moved, 'right')).toEqual(['media', 'microphone', 'tray', 'status', 'plugins-right', 'clock'])
  })

  it('moves an item into another slot at the index it is given', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 0 })
    expect(idsInSlot(moved, 'center')).toEqual(['clock', 'launcher'])
    expect(idsInSlot(moved, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right'])
  })

  it('renumbers order from zero in every slot', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'left', index: 1 })
    expect(ordersInSlot(moved, 'left')).toEqual([0, 1, 2, 3, 4])
    expect(ordersInSlot(moved, 'center')).toEqual([0])
    expect(ordersInSlot(moved, 'right')).toEqual([0, 1, 2, 3, 4])
  })

  it('counts the index among visible items only', () => {
    const moved = moveTopbarItem(withHidden('media'), 'clock', { slot: 'right', index: 1 })
    expect(visibleIdsInSlot(moved, 'right')).toEqual(['tray', 'clock', 'microphone', 'status', 'plugins-right'])
    expect(idsInSlot(moved, 'right')).toEqual(['tray', 'media', 'clock', 'microphone', 'status', 'plugins-right'])
  })

  it('clamps an index outside the slot to its nearest end', () => {
    const pastTheEnd = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 99 })
    const beforeTheStart = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: -3 })
    expect(idsInSlot(pastTheEnd, 'center')).toEqual(['launcher', 'clock'])
    expect(idsInSlot(beforeTheStart, 'center')).toEqual(['clock', 'launcher'])
  })

  it('keeps the visibility of the item it moves and of every other item', () => {
    const moved = moveTopbarItem(withHidden('media'), 'media', { slot: 'center', index: 0 })
    expect(itemById(moved, 'media')).toEqual({ id: 'media', slot: 'center', order: 0, visible: false })
    expect(moved.filter((item) => item.id !== 'media' && item.id !== 'desktop-lines').every((item) => item.visible)).toBe(true)
  })

  it('moves a plugin group to another side like any element', () => {
    const leftGroupOnTheRight = moveTopbarItem(DEFAULT_ITEMS, 'plugins-left', { slot: 'right', index: 0 })
    expect(idsInSlot(leftGroupOnTheRight, 'left')).toEqual(['system-menu', 'desktops', 'desktop-lines'])
    expect(idsInSlot(leftGroupOnTheRight, 'right')).toEqual([
      'plugins-left',
      'tray',
      'media',
      'microphone',
      'status',
      'plugins-right',
      'clock',
    ])

    const rightGroupInTheCentre = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'center', index: 0 })
    expect(idsInSlot(rightGroupInTheCentre, 'center')).toEqual(['plugins-right', 'launcher'])
    expect(idsInSlot(rightGroupInTheCentre, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'clock'])
  })

  it('still reorders a plugin group within its home slot', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'right', index: 0 })
    expect(idsInSlot(moved, 'right')).toEqual(['plugins-right', 'tray', 'media', 'microphone', 'status', 'clock'])
  })

  it('refuses a slot that does not exist', () => {
    expect(moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'top' as TopbarSlot, index: 0 })).toBe(DEFAULT_ITEMS)
  })

  it('returns the same layout when the item is already where it was asked to go', () => {
    expect(moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'right', index: 5 })).toBe(DEFAULT_ITEMS)
  })

  it('returns the same layout for an item the layout does not hold', () => {
    const withoutClock = DEFAULT_ITEMS.filter((item) => item.id !== 'clock')
    expect(moveTopbarItem(withoutClock, 'clock', { slot: 'left', index: 0 })).toBe(withoutClock)
  })

  it('leaves the layout it was given untouched', () => {
    const snapshot = JSON.parse(JSON.stringify(DEFAULT_ITEMS))
    moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'left', index: 0 })
    expect(DEFAULT_ITEMS).toEqual(snapshot)
  })
})

describe('stepTopbarItem', () => {
  it('steps an item one place earlier or later within its slot', () => {
    expect(idsInSlot(stepTopbarItem(DEFAULT_ITEMS, 'media', 'earlier'), 'right')).toEqual([
      'media',
      'tray',
      'microphone',
      'status',
      'plugins-right',
      'clock',
    ])
    expect(idsInSlot(stepTopbarItem(DEFAULT_ITEMS, 'media', 'later'), 'right')).toEqual([
      'tray',
      'microphone',
      'media',
      'status',
      'plugins-right',
      'clock',
    ])
  })

  it('steps past hidden neighbours as if they were not there', () => {
    const stepped = stepTopbarItem(withHidden('microphone'), 'media', 'later')
    expect(visibleIdsInSlot(stepped, 'right')).toEqual(['tray', 'status', 'media', 'plugins-right', 'clock'])
  })

  it('crosses a lane edge into the near end of the next lane', () => {
    const systemMenuLater = [1, 2, 3].reduce((items) => stepTopbarItem(items, 'system-menu', 'later'), DEFAULT_ITEMS)
    expect(idsInSlot(systemMenuLater, 'left')).toEqual(['plugins-left', 'desktops', 'desktop-lines'])
    expect(idsInSlot(systemMenuLater, 'center')).toEqual(['system-menu', 'launcher'])

    const trayEarlier = stepTopbarItem(DEFAULT_ITEMS, 'tray', 'earlier')
    expect(idsInSlot(trayEarlier, 'center')).toEqual(['launcher', 'tray'])
    expect(idsInSlot(trayEarlier, 'right')).toEqual(['media', 'microphone', 'status', 'plugins-right', 'clock'])
  })

  it('crosses into a lane whose items are all hidden', () => {
    const stepped = stepTopbarItem(withHidden('launcher'), 'desktops', 'later')
    expect(visibleIdsInSlot(stepped, 'center')).toEqual(['desktops'])
    expect(idsInSlot(stepped, 'center')).toEqual(['launcher', 'desktops'])
  })

  it('stays put at either end of the bar', () => {
    expect(stepTopbarItem(DEFAULT_ITEMS, 'system-menu', 'earlier')).toBe(DEFAULT_ITEMS)
    expect(stepTopbarItem(DEFAULT_ITEMS, 'clock', 'later')).toBe(DEFAULT_ITEMS)
  })

  it('steps a plugin group across a lane edge like any element', () => {
    const leftGroupLater = stepTopbarItem(stepTopbarItem(DEFAULT_ITEMS, 'plugins-left', 'later'), 'plugins-left', 'later')
    expect(idsInSlot(leftGroupLater, 'left')).toEqual(['system-menu', 'desktops', 'desktop-lines'])
    expect(idsInSlot(leftGroupLater, 'center')).toEqual(['plugins-left', 'launcher'])

    const rightGroupAtLaneStart = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'right', index: 0 })
    const rightGroupEarlier = stepTopbarItem(rightGroupAtLaneStart, 'plugins-right', 'earlier')
    expect(idsInSlot(rightGroupEarlier, 'center')).toEqual(['launcher', 'plugins-right'])
  })

  it('walks an element through every target in order', () => {
    expect(walkLater(DEFAULT_ITEMS, 'system-menu')).toEqual(topbarItemTargets(DEFAULT_ITEMS, 'system-menu'))
  })

  it('walks a plugin group through every target in order', () => {
    const groupAtStart = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'left', index: 0 })
    expect(walkLater(groupAtStart, 'plugins-right')).toEqual(topbarItemTargets(groupAtStart, 'plugins-right'))
  })

  it('undoes a step later with a step earlier', () => {
    const there = stepTopbarItem(DEFAULT_ITEMS, 'plugins-left', 'later')
    expect(stepTopbarItem(there, 'plugins-left', 'earlier')).toEqual(DEFAULT_ITEMS)
  })
})

describe('topbarItemTargets', () => {
  it('lists every position an element can take, lane by lane, in bar order', () => {
    expect(topbarItemTargets(DEFAULT_ITEMS, 'clock')).toEqual([
      { slot: 'left', index: 0 },
      { slot: 'left', index: 1 },
      { slot: 'left', index: 2 },
      { slot: 'left', index: 3 },
      { slot: 'center', index: 0 },
      { slot: 'center', index: 1 },
      { slot: 'right', index: 0 },
      { slot: 'right', index: 1 },
      { slot: 'right', index: 2 },
      { slot: 'right', index: 3 },
      { slot: 'right', index: 4 },
      { slot: 'right', index: 5 },
    ])
  })

  it('offers a plugin group every lane, not only its home lane', () => {
    expect(topbarItemTargets(DEFAULT_ITEMS, 'plugins-left')).toEqual([
      { slot: 'left', index: 0 },
      { slot: 'left', index: 1 },
      { slot: 'left', index: 2 },
      { slot: 'center', index: 0 },
      { slot: 'center', index: 1 },
      { slot: 'right', index: 0 },
      { slot: 'right', index: 1 },
      { slot: 'right', index: 2 },
      { slot: 'right', index: 3 },
      { slot: 'right', index: 4 },
      { slot: 'right', index: 5 },
      { slot: 'right', index: 6 },
    ])
  })

  it('counts only the visible items of each lane', () => {
    const targets = topbarItemTargets(withHidden('media', 'launcher'), 'clock')
    expect(targets.filter((target) => target.slot === 'left')).toHaveLength(4)
    expect(targets.filter((target) => target.slot === 'center')).toEqual([{ slot: 'center', index: 0 }])
    expect(targets.filter((target) => target.slot === 'right')).toHaveLength(5)
  })

  it('is empty for an item the layout does not hold', () => {
    expect(topbarItemTargets(DEFAULT_ITEMS.filter((item) => item.id !== 'clock'), 'clock')).toEqual([])
  })
})

describe('topbarItemPosition', () => {
  it('reports the slot and the place among visible items', () => {
    expect(topbarItemPosition(DEFAULT_ITEMS, 'clock')).toEqual({ slot: 'right', index: 5 })
    expect(topbarItemPosition(withHidden('media'), 'clock')).toEqual({ slot: 'right', index: 4 })
  })

  it('places a hidden item after the visible items that precede it', () => {
    expect(topbarItemPosition(withHidden('media'), 'media')).toEqual({ slot: 'right', index: 1 })
  })

  it('is null for an item the layout does not hold', () => {
    expect(topbarItemPosition(DEFAULT_ITEMS.filter((item) => item.id !== 'clock'), 'clock')).toBeNull()
  })
})

describe('setTopbarItemVisible', () => {
  it('hides an item where it stands', () => {
    const hidden = setTopbarItemVisible(DEFAULT_ITEMS, 'plugins-left', false)
    expect(idsInSlot(hidden, 'left')).toEqual(['system-menu', 'plugins-left', 'desktops', 'desktop-lines'])
    expect(visibleIdsInSlot(hidden, 'left')).toEqual(['system-menu', 'desktops'])
    expect(itemById(hidden, 'plugins-left')).toEqual({ id: 'plugins-left', slot: 'left', order: 1, visible: false })
  })

  it('shows a hidden item again in the same place', () => {
    const hidden = setTopbarItemVisible(DEFAULT_ITEMS, 'plugins-left', false)
    expect(setTopbarItemVisible(hidden, 'plugins-left', true)).toEqual(DEFAULT_ITEMS)
  })

  it('keeps a moved item in its new place through a hide and a show', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 0 })
    const hiddenThenShown = setTopbarItemVisible(setTopbarItemVisible(moved, 'clock', false), 'clock', true)
    expect(hiddenThenShown).toEqual(moved)
  })

  it('returns the same layout when the item is already in that state', () => {
    expect(setTopbarItemVisible(DEFAULT_ITEMS, 'plugins-left', true)).toBe(DEFAULT_ITEMS)
  })
})

describe('isDefaultTopbarArrangement', () => {
  it('accepts the shipped arrangement however it was stored', () => {
    expect(isDefaultTopbarArrangement(DEFAULT_ITEMS)).toBe(true)
    expect(isDefaultTopbarArrangement(resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT))).toBe(true)
    expect(isDefaultTopbarArrangement(resolveTopbarLayout(storeTopbarLayout(DEFAULT_ITEMS)))).toBe(true)
  })

  it('rejects an arrangement with a moved item', () => {
    expect(isDefaultTopbarArrangement(moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 0 }))).toBe(
      false
    )
  })

  it('rejects an arrangement with a plugin group moved to another side', () => {
    expect(
      isDefaultTopbarArrangement(moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'left', index: 0 }))
    ).toBe(false)
  })

  it('rejects an arrangement with a hidden item, because a reset would show it again', () => {
    expect(isDefaultTopbarArrangement(setTopbarItemVisible(DEFAULT_ITEMS, 'media', false))).toBe(false)
  })

  it('accepts an arrangement whose items were moved back', () => {
    const there = stepTopbarItem(DEFAULT_ITEMS, 'tray', 'earlier')
    expect(isDefaultTopbarArrangement(stepTopbarItem(there, 'tray', 'later'))).toBe(true)
  })
})

describe('serialisation of edits', () => {
  it('round-trips a sequence of edits through storeTopbarLayout and resolveTopbarLayout', () => {
    const edited = moveTopbarItem(
      stepTopbarItem(
        setTopbarItemVisible(moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 0 }), 'media', false),
        'plugins-left',
        'later'
      ),
      'plugins-right',
      { slot: 'left', index: 0 }
    )
    expect(resolveTopbarLayout(storeTopbarLayout(edited))).toEqual(edited)
  })
})

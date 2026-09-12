import { describe, it, expect } from 'vitest'
import {
  EMPTY_TOPBAR_LAYOUT,
  TOPBAR_SLOTS,
  acceptsTopbarItem,
  findTopbarItem,
  resolveTopbarLayout,
  storeTopbarLayout,
  topbarSlotItems,
  visibleTopbarSlotItems,
} from './topbarLayout'
import {
  isDefaultTopbarArrangement,
  moveTopbarItem,
  setTopbarItemVisible,
  stepTopbarItem,
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
const acceptedSlots = (id: TopbarItemId) =>
  TOPBAR_SLOTS.filter((slot) => {
    const definition = findTopbarItem(id)
    return definition !== undefined && acceptsTopbarItem(definition, slot)
  })

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

describe('acceptsTopbarItem', () => {
  it('lets an element into every slot and a plugin group only into its own', () => {
    expect(acceptedSlots('clock')).toEqual(['left', 'center', 'right'])
    expect(acceptedSlots('plugins-left')).toEqual(['left'])
    expect(acceptedSlots('plugins-right')).toEqual(['right'])
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
    expect(ordersInSlot(moved, 'left')).toEqual([0, 1, 2, 3])
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
    expect(moved.filter((item) => item.id !== 'media').every((item) => item.visible)).toBe(true)
  })

  it('refuses to move a plugin group out of its home slot', () => {
    expect(moveTopbarItem(DEFAULT_ITEMS, 'plugins-left', { slot: 'right', index: 0 })).toBe(DEFAULT_ITEMS)
    expect(moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'center', index: 0 })).toBe(DEFAULT_ITEMS)
  })

  it('still reorders a plugin group within its home slot', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'right', index: 0 })
    expect(idsInSlot(moved, 'right')).toEqual(['plugins-right', 'tray', 'media', 'microphone', 'status', 'clock'])
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
    const noticeLater = stepTopbarItem(DEFAULT_ITEMS, 'notice', 'later')
    expect(idsInSlot(noticeLater, 'left')).toEqual(['system-menu', 'plugins-left'])
    expect(idsInSlot(noticeLater, 'center')).toEqual(['notice', 'launcher'])

    const trayEarlier = stepTopbarItem(DEFAULT_ITEMS, 'tray', 'earlier')
    expect(idsInSlot(trayEarlier, 'center')).toEqual(['launcher', 'tray'])
    expect(idsInSlot(trayEarlier, 'right')).toEqual(['media', 'microphone', 'status', 'plugins-right', 'clock'])
  })

  it('crosses into a lane whose items are all hidden', () => {
    const stepped = stepTopbarItem(withHidden('launcher'), 'notice', 'later')
    expect(visibleIdsInSlot(stepped, 'center')).toEqual(['notice'])
    expect(idsInSlot(stepped, 'center')).toEqual(['launcher', 'notice'])
  })

  it('stays put at either end of the bar', () => {
    expect(stepTopbarItem(DEFAULT_ITEMS, 'system-menu', 'earlier')).toBe(DEFAULT_ITEMS)
    expect(stepTopbarItem(DEFAULT_ITEMS, 'clock', 'later')).toBe(DEFAULT_ITEMS)
  })

  it('skips every lane that refuses a plugin group, so the group stays in its own', () => {
    const leftGroupAtEdge = stepTopbarItem(DEFAULT_ITEMS, 'plugins-left', 'later')
    expect(idsInSlot(leftGroupAtEdge, 'left')).toEqual(['system-menu', 'notice', 'plugins-left'])
    expect(stepTopbarItem(leftGroupAtEdge, 'plugins-left', 'later')).toBe(leftGroupAtEdge)

    const rightGroupAtEdge = moveTopbarItem(DEFAULT_ITEMS, 'plugins-right', { slot: 'right', index: 0 })
    expect(stepTopbarItem(rightGroupAtEdge, 'plugins-right', 'earlier')).toBe(rightGroupAtEdge)
  })

  it('walks an element through every target in order', () => {
    expect(walkLater(DEFAULT_ITEMS, 'system-menu')).toEqual(topbarItemTargets(DEFAULT_ITEMS, 'system-menu'))
  })

  it('undoes a step later with a step earlier', () => {
    const there = stepTopbarItem(DEFAULT_ITEMS, 'notice', 'later')
    expect(stepTopbarItem(there, 'notice', 'earlier')).toEqual(DEFAULT_ITEMS)
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

  it('offers a plugin group only its home lane', () => {
    expect(topbarItemTargets(DEFAULT_ITEMS, 'plugins-left')).toEqual([
      { slot: 'left', index: 0 },
      { slot: 'left', index: 1 },
      { slot: 'left', index: 2 },
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
    const hidden = setTopbarItemVisible(DEFAULT_ITEMS, 'notice', false)
    expect(idsInSlot(hidden, 'left')).toEqual(['system-menu', 'plugins-left', 'notice'])
    expect(visibleIdsInSlot(hidden, 'left')).toEqual(['system-menu', 'plugins-left'])
    expect(itemById(hidden, 'notice')).toEqual({ id: 'notice', slot: 'left', order: 2, visible: false })
  })

  it('shows a hidden item again in the same place', () => {
    const hidden = setTopbarItemVisible(DEFAULT_ITEMS, 'notice', false)
    expect(setTopbarItemVisible(hidden, 'notice', true)).toEqual(DEFAULT_ITEMS)
  })

  it('keeps a moved item in its new place through a hide and a show', () => {
    const moved = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 0 })
    const hiddenThenShown = setTopbarItemVisible(setTopbarItemVisible(moved, 'clock', false), 'clock', true)
    expect(hiddenThenShown).toEqual(moved)
  })

  it('returns the same layout when the item is already in that state', () => {
    expect(setTopbarItemVisible(DEFAULT_ITEMS, 'notice', true)).toBe(DEFAULT_ITEMS)
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
        'notice',
        'later'
      ),
      'plugins-right',
      { slot: 'right', index: 0 }
    )
    expect(resolveTopbarLayout(storeTopbarLayout(edited))).toEqual(edited)
  })
})

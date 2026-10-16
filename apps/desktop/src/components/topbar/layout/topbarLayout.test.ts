import { describe, it, expect } from 'vitest'
import {
  EMPTY_TOPBAR_LAYOUT,
  TOPBAR_ITEMS,
  findTopbarItem,
  isTopbarItemGated,
  resolveTopbarLayout,
  storeTopbarLayout,
  topbarItemLabel,
  topbarSlotAcceptsItem,
  topbarSlotItems,
  visibleTopbarSlotItems,
} from './topbarLayout'

const idsInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) => topbarSlotItems(items, slot).map((item) => item.id)
const visibleIdsInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) =>
  visibleTopbarSlotItems(items, slot).map((item) => item.id)

describe('default model', () => {
  it('reproduces the shipped bar when nothing is stored', () => {
    const items = resolveTopbarLayout(null)
    expect(visibleIdsInSlot(items, 'left')).toEqual(['system-menu', 'plugins-left', 'desktops'])
    expect(visibleIdsInSlot(items, 'center')).toEqual(['launcher'])
    expect(visibleIdsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'])
  })

  it('resolves undefined, an empty layout and a stored default identically', () => {
    const fromNothing = resolveTopbarLayout(undefined)
    expect(resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT)).toEqual(fromNothing)
    expect(resolveTopbarLayout(storeTopbarLayout(fromNothing))).toEqual(fromNothing)
  })

  it('makes every catalogue item visible by default except the ones that start hidden', () => {
    const items = resolveTopbarLayout(null)
    expect(items).toHaveLength(TOPBAR_ITEMS.length)
    expect(items.filter((item) => !item.visible).map((item) => item.id)).toEqual(['desktop-lines'])
  })

  it('keeps an item that starts hidden hidden until a stored layout places it', () => {
    const neverPlaced = resolveTopbarLayout({ slots: { left: ['system-menu'], center: [], right: [] }, hidden: [] })
    expect(neverPlaced.find((item) => item.id === 'desktop-lines')?.visible).toBe(false)

    const placed = resolveTopbarLayout({ slots: { left: ['desktop-lines'], center: [], right: [] }, hidden: [] })
    expect(placed.find((item) => item.id === 'desktop-lines')?.visible).toBe(true)
  })

  it('keeps an item that starts hidden hidden through a store round trip', () => {
    const defaults = resolveTopbarLayout(null)
    expect(resolveTopbarLayout(storeTopbarLayout(defaults))).toEqual(defaults)
  })

  it('numbers order from zero within each slot', () => {
    const items = resolveTopbarLayout(null)
    expect(topbarSlotItems(items, 'right').map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5])
    expect(topbarSlotItems(items, 'center').map((item) => item.order)).toEqual([0])
  })
})

describe('ordering', () => {
  it('honours a stored order', () => {
    const items = resolveTopbarLayout({
      slots: { left: [], center: [], right: ['clock', 'status', 'tray', 'media', 'microphone', 'plugins-right'] },
      hidden: [],
    })
    expect(idsInSlot(items, 'right')).toEqual(['clock', 'status', 'tray', 'media', 'microphone', 'plugins-right'])
  })

  it('slots an item a complete stored order does not mention between its catalogue neighbours', () => {
    const items = resolveTopbarLayout({
      slots: { left: [], center: [], right: ['tray', 'media', 'microphone', 'plugins-right', 'clock'] },
      hidden: [],
    })
    expect(idsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'])
  })

  it('puts an unmentioned item that opens its slot in the catalogue at the front', () => {
    const items = resolveTopbarLayout({ slots: { left: ['plugins-left'], center: [], right: [] }, hidden: [] })
    expect(idsInSlot(items, 'left')).toEqual(['system-menu', 'plugins-left', 'desktops', 'desktop-lines'])
  })

  it('anchors unmentioned items to the catalogue rather than the end of the slot', () => {
    const items = resolveTopbarLayout({ slots: { left: [], center: [], right: ['clock'] }, hidden: [] })
    expect(idsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'])
  })

  it('ignores unknown ids', () => {
    const items = resolveTopbarLayout({
      slots: { left: ['weather', 'plugins-left', 'system-menu'], center: [], right: [] },
      hidden: [],
    })
    expect(idsInSlot(items, 'left')).toEqual(['plugins-left', 'desktops', 'desktop-lines', 'system-menu'])
  })

  it('keeps the first placement when an id is stored twice', () => {
    const items = resolveTopbarLayout({ slots: { left: ['clock'], center: [], right: ['clock'] }, hidden: [] })
    expect(idsInSlot(items, 'left')).toContain('clock')
    expect(idsInSlot(items, 'right')).not.toContain('clock')
    expect(items.filter((item) => item.id === 'clock')).toHaveLength(1)
  })

  it('moves an element to another slot', () => {
    const items = resolveTopbarLayout({ slots: { left: [], center: ['clock'], right: [] }, hidden: [] })
    expect(idsInSlot(items, 'center')).toEqual(['launcher', 'clock'])
    expect(idsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right'])
  })

  it('survives a malformed stored layout', () => {
    const malformed = { slots: { left: 'nope', center: null, right: [7, 'clock'] }, hidden: 'none' }
    const items = resolveTopbarLayout(malformed as unknown as StoredTopbarLayout)
    expect(idsInSlot(items, 'left')).toEqual(['system-menu', 'plugins-left', 'desktops', 'desktop-lines'])
    expect(idsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'])
    expect(items.filter((item) => !item.visible).map((item) => item.id)).toEqual(['desktop-lines'])
  })
})

describe('plugin groups', () => {
  it('places a plugin group on whichever side it is stored on', () => {
    const items = resolveTopbarLayout({ slots: { left: ['plugins-right'], center: ['plugins-left'], right: [] }, hidden: [] })
    expect(idsInSlot(items, 'left')).toEqual(['system-menu', 'desktops', 'desktop-lines', 'plugins-right'])
    expect(idsInSlot(items, 'center')).toEqual(['plugins-left', 'launcher'])
    expect(idsInSlot(items, 'right')).not.toContain('plugins-right')
  })

  it('still reorders a plugin group inside its own slot', () => {
    const items = resolveTopbarLayout({
      slots: { left: [], center: [], right: ['plugins-right', 'clock', 'tray', 'media', 'microphone', 'status'] },
      hidden: [],
    })
    expect(idsInSlot(items, 'right').slice(0, 2)).toEqual(['plugins-right', 'clock'])
  })

  it('declares both plugin groups as dynamic containers', () => {
    expect(findTopbarItem('plugins-left')?.kind).toBe('plugin-group')
    expect(findTopbarItem('plugins-right')?.kind).toBe('plugin-group')
    expect(findTopbarItem('clock')?.kind).toBe('element')
  })
})

describe('visibility', () => {
  it('hides the items the user turned off without dropping them from the model', () => {
    const items = resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ['clock', 'launcher'] })
    expect(visibleIdsInSlot(items, 'center')).toEqual([])
    expect(idsInSlot(items, 'center')).toEqual(['launcher'])
    expect(visibleIdsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right'])
  })

  it('ignores hidden ids that are not bar items', () => {
    const items = resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ['weather'] })
    expect(items.filter((item) => !item.visible).map((item) => item.id)).toEqual(['desktop-lines'])
  })
})

describe('serialisation', () => {
  it('round-trips an edited layout', () => {
    const edited = resolveTopbarLayout({ slots: { left: [], center: [], right: ['clock', 'tray'] }, hidden: ['media'] })
    expect(resolveTopbarLayout(storeTopbarLayout(edited))).toEqual(edited)
  })

  it('stores every slot and the hidden set', () => {
    const stored = storeTopbarLayout(resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ['plugins-left'] }))
    expect(stored.slots.left).toEqual(['system-menu', 'plugins-left', 'desktops', 'desktop-lines'])
    expect(stored.slots.center).toEqual(['launcher'])
    expect(stored.hidden).toEqual(['plugins-left', 'desktop-lines'])
  })
})

describe('topbarItemLabel', () => {
  it.each(TOPBAR_ITEMS)('names $id with its Ridge label, $label', ({ id, label }) => {
    expect(topbarItemLabel(id)).toBe(label)
  })
})

describe('isTopbarItemGated', () => {
  it('names Search and Tray, the two items their own flags gate', () => {
    expect(TOPBAR_ITEMS.map((item) => item.id).filter(isTopbarItemGated)).toEqual(['launcher', 'tray'])
  })
})

describe('topbarSlotAcceptsItem', () => {
  it.each<[TopbarSlot, TopbarItemId, boolean]>([
    ['center', 'clock', true],
    ['left', 'tray', true],
    ['left', 'plugins-left', true],
    ['center', 'plugins-left', true],
    ['right', 'plugins-left', true],
    ['right', 'plugins-right', true],
    ['center', 'plugins-right', true],
    ['left', 'plugins-right', true],
  ])('lets the %s side take %s: %s', (slot, id, accepted) => {
    expect(topbarSlotAcceptsItem(slot, id)).toBe(accepted)
  })

  it('refuses an id that is not a bar item', () => {
    expect(topbarSlotAcceptsItem('left', 'weather' as TopbarItemId)).toBe(false)
  })

  it('refuses a side that is not a slot', () => {
    expect(topbarSlotAcceptsItem('top' as TopbarSlot, 'clock')).toBe(false)
  })
})

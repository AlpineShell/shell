import { describe, it, expect } from 'vitest'
import {
  EMPTY_TOPBAR_LAYOUT,
  TOPBAR_ITEMS,
  findTopbarItem,
  resolveTopbarLayout,
  storeTopbarLayout,
  topbarSlotItems,
  visibleTopbarSlotItems,
} from './topbarLayout'

const idsInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) => topbarSlotItems(items, slot).map((item) => item.id)
const visibleIdsInSlot = (items: TopbarLayoutItem[], slot: TopbarSlot) =>
  visibleTopbarSlotItems(items, slot).map((item) => item.id)

describe('default model', () => {
  it('reproduces the shipped bar when nothing is stored', () => {
    const items = resolveTopbarLayout(null)
    expect(visibleIdsInSlot(items, 'left')).toEqual(['system-menu', 'plugins-left', 'notice'])
    expect(visibleIdsInSlot(items, 'center')).toEqual(['launcher'])
    expect(visibleIdsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'])
  })

  it('resolves undefined, an empty layout and a stored default identically', () => {
    const fromNothing = resolveTopbarLayout(undefined)
    expect(resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT)).toEqual(fromNothing)
    expect(resolveTopbarLayout(storeTopbarLayout(fromNothing))).toEqual(fromNothing)
  })

  it('makes every catalogue item visible by default', () => {
    const items = resolveTopbarLayout(null)
    expect(items).toHaveLength(TOPBAR_ITEMS.length)
    expect(items.every((item) => item.visible)).toBe(true)
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

  it('appends items the stored order does not mention', () => {
    const items = resolveTopbarLayout({ slots: { left: [], center: [], right: ['clock'] }, hidden: [] })
    expect(idsInSlot(items, 'right')).toEqual(['clock', 'tray', 'media', 'microphone', 'status', 'plugins-right'])
  })

  it('ignores unknown ids', () => {
    const items = resolveTopbarLayout({ slots: { left: ['weather', 'notice'], center: [], right: [] }, hidden: [] })
    expect(idsInSlot(items, 'left')).toEqual(['notice', 'system-menu', 'plugins-left'])
  })

  it('keeps the first placement when an id is stored twice', () => {
    const items = resolveTopbarLayout({ slots: { left: ['clock'], center: [], right: ['clock'] }, hidden: [] })
    expect(idsInSlot(items, 'left')).toContain('clock')
    expect(idsInSlot(items, 'right')).not.toContain('clock')
    expect(items.filter((item) => item.id === 'clock')).toHaveLength(1)
  })

  it('moves an element to another slot', () => {
    const items = resolveTopbarLayout({ slots: { left: [], center: ['clock'], right: [] }, hidden: [] })
    expect(idsInSlot(items, 'center')).toEqual(['clock', 'launcher'])
    expect(idsInSlot(items, 'right')).toEqual(['tray', 'media', 'microphone', 'status', 'plugins-right'])
  })

  it('survives a malformed stored layout', () => {
    const malformed = { slots: { left: 'nope', center: null, right: [7, 'clock'] }, hidden: 'none' }
    const items = resolveTopbarLayout(malformed as unknown as StoredTopbarLayout)
    expect(idsInSlot(items, 'left')).toEqual(['system-menu', 'plugins-left', 'notice'])
    expect(idsInSlot(items, 'right')[0]).toBe('clock')
    expect(items.every((item) => item.visible)).toBe(true)
  })
})

describe('plugin groups', () => {
  it('pins a plugin group to the slot its contributions declare', () => {
    const items = resolveTopbarLayout({ slots: { left: ['plugins-right'], center: [], right: [] }, hidden: [] })
    expect(idsInSlot(items, 'left')).not.toContain('plugins-right')
    expect(idsInSlot(items, 'right')).toContain('plugins-right')
  })

  it('still reorders a plugin group inside its own slot', () => {
    const items = resolveTopbarLayout({ slots: { left: [], center: [], right: ['plugins-right', 'clock'] }, hidden: [] })
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
    expect(items.every((item) => item.visible)).toBe(true)
  })
})

describe('serialisation', () => {
  it('round-trips an edited layout', () => {
    const edited = resolveTopbarLayout({ slots: { left: [], center: [], right: ['clock', 'tray'] }, hidden: ['media'] })
    expect(resolveTopbarLayout(storeTopbarLayout(edited))).toEqual(edited)
  })

  it('stores every slot and the hidden set', () => {
    const stored = storeTopbarLayout(resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ['notice'] }))
    expect(stored.slots.left).toEqual(['system-menu', 'plugins-left', 'notice'])
    expect(stored.slots.center).toEqual(['launcher'])
    expect(stored.hidden).toEqual(['notice'])
  })
})

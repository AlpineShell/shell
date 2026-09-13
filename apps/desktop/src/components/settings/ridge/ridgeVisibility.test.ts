import { describe, it, expect } from 'vitest'
import { EMPTY_TOPBAR_LAYOUT, resolveTopbarLayout, topbarSlotItems } from '../../topbar/layout/topbarLayout'
import { moveTopbarItem, setTopbarItemVisible } from '../../topbar/layout/topbarLayoutEdits'
import {
  effectiveRidgeItems,
  hideRidgeItemPlan,
  isDefaultRidge,
  resetRidgePlan,
  restoreLayoutVisibility,
  showRidgeItemPlan,
} from './ridgeVisibility'

const DEFAULT_LAYOUT = resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT)
const DEFAULT_GATES: RidgeGates['visible'] = { launcher: false, tray: true }
const EVERY_GATE_ON: RidgeGates['visible'] = { launcher: true, tray: true }
const EVERY_GATE_OFF: RidgeGates['visible'] = { launcher: false, tray: false }
const GATED_ITEMS: TopbarGatedItemId[] = ['launcher', 'tray']

const layoutHiding = (...ids: TopbarItemId[]) =>
  resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ids })
const visibilityOf = (items: TopbarLayoutItem[], id: TopbarItemId) => items.find((item) => item.id === id)?.visible
const withGate = (item: TopbarGatedItemId, visible: boolean): RidgeGates['visible'] => ({
  ...EVERY_GATE_ON,
  [item]: visible,
})
const placement = (items: TopbarLayoutItem[]) => items.map(({ id, slot, order }) => ({ id, slot, order }))

describe.each(GATED_ITEMS)('effectiveRidgeItems for %s', (item) => {
  it.each([
    { layoutHidden: false, flag: true, visible: true },
    { layoutHidden: false, flag: false, visible: false },
    { layoutHidden: true, flag: true, visible: false },
    { layoutHidden: true, flag: false, visible: false },
  ])('shows it only when the layout and the flag both do (layout hidden $layoutHidden, flag $flag)', ({
    layoutHidden,
    flag,
    visible,
  }) => {
    const layout = layoutHidden ? layoutHiding(item) : DEFAULT_LAYOUT
    expect(visibilityOf(effectiveRidgeItems(layout, withGate(item, flag)), item)).toBe(visible)
  })
})

describe('effectiveRidgeItems', () => {
  it('leaves every ungated item as the layout has it, whatever the flags say', () => {
    const effective = effectiveRidgeItems(layoutHiding('media'), EVERY_GATE_OFF)

    expect(visibilityOf(effective, 'media')).toBe(false)
    expect(visibilityOf(effective, 'clock')).toBe(true)
    expect(visibilityOf(effective, 'system-menu')).toBe(true)
  })

  it('keeps every item where the layout places it', () => {
    expect(placement(effectiveRidgeItems(DEFAULT_LAYOUT, EVERY_GATE_OFF))).toEqual(placement(DEFAULT_LAYOUT))
  })

  it('returns the layout itself when no flag hides anything it shows', () => {
    const launcherHidden = layoutHiding('launcher')

    expect(effectiveRidgeItems(DEFAULT_LAYOUT, EVERY_GATE_ON)).toBe(DEFAULT_LAYOUT)
    expect(effectiveRidgeItems(launcherHidden, DEFAULT_GATES)).toBe(launcherHidden)
  })
})

describe('restoreLayoutVisibility', () => {
  it('puts back the stored visibility of an item a flag hides, keeping the new arrangement', () => {
    const effective = effectiveRidgeItems(DEFAULT_LAYOUT, DEFAULT_GATES)
    const arranged = moveTopbarItem(effective, 'clock', { slot: 'center', index: 0 })

    const restored = restoreLayoutVisibility(arranged, DEFAULT_LAYOUT)

    expect(visibilityOf(restored, 'launcher')).toBe(true)
    expect(topbarSlotItems(restored, 'center').map((item) => item.id)).toEqual(['launcher', 'clock'])
  })

  it('keeps an item the layout hides hidden', () => {
    const layout = layoutHiding('media')
    const arranged = moveTopbarItem(effectiveRidgeItems(layout, DEFAULT_GATES), 'clock', { slot: 'left', index: 0 })

    const restored = restoreLayoutVisibility(arranged, layout)

    expect(visibilityOf(restored, 'media')).toBe(false)
    expect(visibilityOf(restored, 'launcher')).toBe(true)
  })

  it('reuses every item whose visibility already matches the layout', () => {
    const arranged = moveTopbarItem(effectiveRidgeItems(DEFAULT_LAYOUT, DEFAULT_GATES), 'clock', {
      slot: 'left',
      index: 0,
    })

    const restored = restoreLayoutVisibility(arranged, DEFAULT_LAYOUT)

    expect(restored.filter((item, at) => item !== arranged[at]).map((item) => item.id)).toEqual(['launcher'])
  })
})

describe.each(GATED_ITEMS)('showRidgeItemPlan for %s', (item) => {
  it('plans nothing when it already shows', () => {
    expect(showRidgeItemPlan(DEFAULT_LAYOUT, withGate(item, true), item)).toEqual([])
  })

  it('only turns the flag on when the layout does not hide it', () => {
    expect(showRidgeItemPlan(DEFAULT_LAYOUT, withGate(item, false), item)).toEqual([
      { kind: 'gate', item, visible: true },
    ])
  })

  it('only clears the layout mark when the flag is already on', () => {
    const layout = layoutHiding(item)

    expect(showRidgeItemPlan(layout, withGate(item, true), item)).toEqual([
      { kind: 'layout', items: setTopbarItemVisible(layout, item, true) },
    ])
  })

  it('clears the layout mark before it turns the flag on', () => {
    const layout = layoutHiding(item)

    expect(showRidgeItemPlan(layout, withGate(item, false), item)).toEqual([
      { kind: 'layout', items: setTopbarItemVisible(layout, item, true) },
      { kind: 'gate', item, visible: true },
    ])
  })
})

describe('showRidgeItemPlan for an ungated item', () => {
  it('clears its layout mark and keeps its place', () => {
    expect(showRidgeItemPlan(layoutHiding('media'), EVERY_GATE_OFF, 'media')).toEqual([
      { kind: 'layout', items: DEFAULT_LAYOUT },
    ])
  })

  it('plans nothing when it already shows', () => {
    expect(showRidgeItemPlan(DEFAULT_LAYOUT, EVERY_GATE_OFF, 'media')).toEqual([])
  })
})

describe.each(GATED_ITEMS)('hideRidgeItemPlan for %s', (item) => {
  it('only turns the flag off, leaving the layout alone', () => {
    expect(hideRidgeItemPlan(DEFAULT_LAYOUT, withGate(item, true), item)).toEqual([
      { kind: 'gate', item, visible: false },
    ])
  })

  it('plans nothing when the flag already hides it', () => {
    expect(hideRidgeItemPlan(DEFAULT_LAYOUT, withGate(item, false), item)).toEqual([])
    expect(hideRidgeItemPlan(layoutHiding(item), withGate(item, false), item)).toEqual([])
  })

  it('plans nothing when the layout already hides it', () => {
    expect(hideRidgeItemPlan(layoutHiding(item), withGate(item, true), item)).toEqual([])
  })
})

describe('hideRidgeItemPlan for an ungated item', () => {
  it('marks it hidden in the layout, where it keeps its place', () => {
    expect(hideRidgeItemPlan(DEFAULT_LAYOUT, EVERY_GATE_ON, 'clock')).toEqual([
      { kind: 'layout', items: layoutHiding('clock') },
    ])
  })

  it('plans nothing when the layout already hides it', () => {
    expect(hideRidgeItemPlan(layoutHiding('clock'), EVERY_GATE_ON, 'clock')).toEqual([])
  })
})

describe('resetRidgePlan', () => {
  it('turns the search flag off, writes the default layout, then turns the tray flag on', () => {
    expect(resetRidgePlan()).toEqual([
      { kind: 'gate', item: 'launcher', visible: false },
      { kind: 'layout-reset' },
      { kind: 'gate', item: 'tray', visible: true },
    ])
  })

  it('hides before the layout and shows after it, so a stopped reset never shows anything early', () => {
    const plan = resetRidgePlan()
    const layoutAt = plan.findIndex((step) => step.kind === 'layout-reset')

    plan.forEach((step, at) => {
      if (step.kind === 'gate') expect(at > layoutAt).toBe(step.visible)
    })
  })
})

describe('isDefaultRidge', () => {
  it('is true for the default layout with the Search button off and the tray on', () => {
    expect(isDefaultRidge(DEFAULT_LAYOUT, DEFAULT_GATES)).toBe(true)
  })

  it.each<[string, TopbarLayoutItem[], RidgeGates['visible']]>([
    ['an item moved', moveTopbarItem(DEFAULT_LAYOUT, 'clock', { slot: 'center', index: 0 }), DEFAULT_GATES],
    ['an item hidden in the layout', layoutHiding('media'), DEFAULT_GATES],
    ['the Search button shown', DEFAULT_LAYOUT, EVERY_GATE_ON],
    ['the tray hidden', DEFAULT_LAYOUT, EVERY_GATE_OFF],
  ])('is false with %s', (_change, layout, gates) => {
    expect(isDefaultRidge(layout, gates)).toBe(false)
  })
})

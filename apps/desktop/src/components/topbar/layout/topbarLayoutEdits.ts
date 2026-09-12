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

const STEP_OFFSETS: Record<TopbarStepDirection, number> = { earlier: -1, later: 1 }

const DEFAULT_TOPBAR_ARRANGEMENT = resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT)

function itemsWithout(items: TopbarLayoutItem[], id: TopbarItemId): TopbarLayoutItem[] {
  return items.filter((item) => item.id !== id)
}

function itemsBySlot(items: TopbarLayoutItem[]): Record<TopbarSlot, TopbarLayoutItem[]> {
  return {
    left: topbarSlotItems(items, 'left'),
    center: topbarSlotItems(items, 'center'),
    right: topbarSlotItems(items, 'right'),
  }
}

function renumberedItems(bySlot: Record<TopbarSlot, TopbarLayoutItem[]>): TopbarLayoutItem[] {
  return TOPBAR_SLOTS.flatMap((slot) => bySlot[slot].map((item, order) => ({ ...item, slot, order })))
}

function sameItem(first: TopbarLayoutItem, second: TopbarLayoutItem): boolean {
  return (
    first.id === second.id &&
    first.slot === second.slot &&
    first.order === second.order &&
    first.visible === second.visible
  )
}

function sameArrangement(first: TopbarLayoutItem[], second: TopbarLayoutItem[]): boolean {
  return first.length === second.length && first.every((item, at) => sameItem(item, second[at]))
}

function previousIfUnchanged(previous: TopbarLayoutItem[], next: TopbarLayoutItem[]): TopbarLayoutItem[] {
  return sameArrangement(previous, next) ? previous : next
}

function slotAcceptsItem(slot: TopbarSlot, id: TopbarItemId): boolean {
  const definition = findTopbarItem(id)
  return definition !== undefined && acceptsTopbarItem(definition, slot)
}

function insertionPoint(slotItems: TopbarLayoutItem[], visibleIndex: number): number {
  const anchor = slotItems.filter((item) => item.visible)[Math.max(visibleIndex, 0)]
  return anchor ? slotItems.indexOf(anchor) : slotItems.length
}

export function moveTopbarItem(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  target: TopbarItemTarget
): TopbarLayoutItem[] {
  const moving = items.find((item) => item.id === id)
  if (!moving || !slotAcceptsItem(target.slot, id)) return items
  const bySlot = itemsBySlot(itemsWithout(items, id))
  const destination = bySlot[target.slot]
  destination.splice(insertionPoint(destination, target.index), 0, moving)
  return previousIfUnchanged(items, renumberedItems(bySlot))
}

export function topbarItemPosition(items: TopbarLayoutItem[], id: TopbarItemId): TopbarItemTarget | null {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) return null
  const slotItems = topbarSlotItems(items, item.slot)
  const preceding = slotItems.slice(0, slotItems.indexOf(item))
  return { slot: item.slot, index: preceding.filter((other) => other.visible).length }
}

function slotTargets(slot: TopbarSlot, visibleOthers: number): TopbarItemTarget[] {
  return Array.from({ length: visibleOthers + 1 }, (_, index) => ({ slot, index }))
}

export function topbarItemTargets(items: TopbarLayoutItem[], id: TopbarItemId): TopbarItemTarget[] {
  if (!items.some((item) => item.id === id)) return []
  const others = itemsWithout(items, id)
  return TOPBAR_SLOTS.filter((slot) => slotAcceptsItem(slot, id)).flatMap((slot) =>
    slotTargets(slot, visibleTopbarSlotItems(others, slot).length)
  )
}

function sameTarget(first: TopbarItemTarget, second: TopbarItemTarget): boolean {
  return first.slot === second.slot && first.index === second.index
}

function neighbouringTarget(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  direction: TopbarStepDirection
): TopbarItemTarget | undefined {
  const position = topbarItemPosition(items, id)
  const targets = topbarItemTargets(items, id)
  const current = position ? targets.findIndex((target) => sameTarget(target, position)) : -1
  return current < 0 ? undefined : targets[current + STEP_OFFSETS[direction]]
}

export function stepTopbarItem(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  direction: TopbarStepDirection
): TopbarLayoutItem[] {
  const target = neighbouringTarget(items, id, direction)
  return target ? moveTopbarItem(items, id, target) : items
}

export function setTopbarItemVisible(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  visible: boolean
): TopbarLayoutItem[] {
  return previousIfUnchanged(
    items,
    items.map((item) => (item.id === id ? { ...item, visible } : item))
  )
}

export function isDefaultTopbarArrangement(items: TopbarLayoutItem[]): boolean {
  return sameArrangement(resolveTopbarLayout(storeTopbarLayout(items)), DEFAULT_TOPBAR_ARRANGEMENT)
}

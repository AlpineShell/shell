import { TOPBAR_SLOTS, acceptsTopbarItem, findTopbarItem, visibleTopbarSlotItems } from '../../topbar/layout/topbarLayout'
import { moveTopbarItem, stepTopbarItem, topbarItemPosition } from '../../topbar/layout/topbarLayoutEdits'

const STEP_KEYS = new Map<string, RidgeKeyStep>([
  ['ArrowLeft', 'earlier'],
  ['ArrowUp', 'earlier'],
  ['ArrowRight', 'later'],
  ['ArrowDown', 'later'],
  ['Home', 'first'],
  ['End', 'last'],
])

const SPACE_KEYS = new Set([' ', 'Spacebar'])

const HIDE_KEYS = new Set(['Delete', 'Backspace'])

const STEP_OFFSETS: Record<TopbarStepDirection, number> = { earlier: -1, later: 1 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function heldModifier(press: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>): boolean {
  return press.altKey || press.ctrlKey || press.metaKey
}

function steppingIntent(step: RidgeKeyStep, grabbed: boolean): RidgeKeyIntent {
  return grabbed ? { kind: 'move', step } : { kind: 'focus', step }
}

export function ridgeKeyIntent(
  press: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>,
  grabbed: boolean
): RidgeKeyIntent {
  if (heldModifier(press)) return { kind: 'native' }
  if (SPACE_KEYS.has(press.key)) return grabbed ? { kind: 'drop' } : { kind: 'grab' }
  if (press.key === 'Enter') return grabbed ? { kind: 'drop' } : { kind: 'native' }
  if (press.key === 'Escape') return grabbed ? { kind: 'cancel' } : { kind: 'native' }
  if (HIDE_KEYS.has(press.key)) return { kind: 'hide' }
  const step = STEP_KEYS.get(press.key)
  return step ? steppingIntent(step, grabbed) : { kind: 'native' }
}

export function ridgeFocusOrder(items: TopbarLayoutItem[]): TopbarItemId[] {
  return TOPBAR_SLOTS.flatMap((slot) => visibleTopbarSlotItems(items, slot).map((item) => item.id))
}

function steppedIndex(current: number, count: number, step: RidgeKeyStep): number {
  if (step === 'first') return 0
  if (step === 'last') return count - 1
  if (current < 0) return 0
  return clamp(current + STEP_OFFSETS[step], 0, count - 1)
}

export function nextFocusedItem(
  order: TopbarItemId[],
  current: TopbarItemId,
  step: RidgeKeyStep
): TopbarItemId | null {
  if (order.length === 0) return null
  return order[steppedIndex(order.indexOf(current), order.length, step)]
}

function laneEndIndex(items: TopbarLayoutItem[], id: TopbarItemId, slot: TopbarSlot): number {
  return visibleTopbarSlotItems(items, slot).filter((item) => item.id !== id).length
}

export function stepGrabbedPosition(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  step: RidgeKeyStep
): TopbarLayoutItem[] {
  if (step === 'earlier' || step === 'later') return stepTopbarItem(items, id, step)
  const position = topbarItemPosition(items, id)
  if (!position) return items
  const index = step === 'first' ? 0 : laneEndIndex(items, id, position.slot)
  return moveTopbarItem(items, id, { slot: position.slot, index })
}

function atLaneEdge(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  position: TopbarItemTarget,
  direction: TopbarStepDirection
): boolean {
  if (direction === 'earlier') return position.index === 0
  return position.index === laneEndIndex(items, id, position.slot)
}

function neighbouringSlot(slot: TopbarSlot, direction: TopbarStepDirection): TopbarSlot | undefined {
  return TOPBAR_SLOTS[TOPBAR_SLOTS.indexOf(slot) + STEP_OFFSETS[direction]]
}

export function refusingSlotForStep(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  step: RidgeKeyStep
): TopbarSlot | null {
  if (step === 'first' || step === 'last') return null
  const definition = findTopbarItem(id)
  const position = topbarItemPosition(items, id)
  if (!definition || !position || !atLaneEdge(items, id, position, step)) return null
  const neighbour = neighbouringSlot(position.slot, step)
  return neighbour && !acceptsTopbarItem(definition, neighbour) ? neighbour : null
}

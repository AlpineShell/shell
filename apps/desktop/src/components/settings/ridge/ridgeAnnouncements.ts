import { findTopbarItem, visibleTopbarSlotItems } from '../../topbar/layout/topbarLayout'
import { topbarItemPosition } from '../../topbar/layout/topbarLayoutEdits'

const SIDE_LABELS: Record<TopbarSlot, string> = { left: 'Left', center: 'Center', right: 'Right' }

const SIDE_PLACES: Record<TopbarSlot, string> = { left: 'on the left', center: 'in the center', right: 'on the right' }

const SIDE_DESTINATIONS: Record<TopbarSlot, string> = {
  left: 'to the left',
  center: 'to the center',
  right: 'to the right',
}

export const RIDGE_KEYBOARD_HINT =
  "Press Enter to open this item's settings. Press Space to pick it up, move it with the arrow keys, then press Space again to drop it. Escape cancels the move, and Delete hides the item."

function itemLabel(id: TopbarItemId): string {
  return findTopbarItem(id)?.label ?? id
}

function sideCountWith(items: TopbarLayoutItem[], id: TopbarItemId, slot: TopbarSlot): number {
  return visibleTopbarSlotItems(items, slot).filter((item) => item.id !== id).length + 1
}

export function ridgeSideLabel(slot: TopbarSlot): string {
  return SIDE_LABELS[slot]
}

export function ridgePositionPhrase(items: TopbarLayoutItem[], id: TopbarItemId): string {
  const position = topbarItemPosition(items, id)
  if (!position) return ''
  return `position ${position.index + 1} of ${sideCountWith(items, id, position.slot)} ${SIDE_PLACES[position.slot]}`
}

export function ridgeGrabAnnouncement(items: TopbarLayoutItem[], id: TopbarItemId): string {
  return `${itemLabel(id)} picked up, ${ridgePositionPhrase(items, id)}.`
}

export function ridgeMoveAnnouncement(items: TopbarLayoutItem[], id: TopbarItemId): string {
  return `${itemLabel(id)}, ${ridgePositionPhrase(items, id)}.`
}

export function ridgeDropAnnouncement(items: TopbarLayoutItem[], id: TopbarItemId): string {
  return `${itemLabel(id)} dropped, ${ridgePositionPhrase(items, id)}.`
}

export function ridgeCancelAnnouncement(items: TopbarLayoutItem[], id: TopbarItemId): string {
  return `${itemLabel(id)} returned to ${ridgePositionPhrase(items, id)}.`
}

export function ridgeEdgeAnnouncement(items: TopbarLayoutItem[], id: TopbarItemId): string {
  return `${itemLabel(id)} can't move any further, ${ridgePositionPhrase(items, id)}.`
}

export function ridgeRefusedAnnouncement(id: TopbarItemId, slot: TopbarSlot): string {
  return `${itemLabel(id)} can't move ${SIDE_DESTINATIONS[slot]}. Plugin groups stay on their own side.`
}

export function ridgeHiddenAnnouncement(id: TopbarItemId): string {
  return `${itemLabel(id)} hidden from Ridge.`
}

export function ridgeShownAnnouncement(items: TopbarLayoutItem[], id: TopbarItemId): string {
  return `${itemLabel(id)} added, ${ridgePositionPhrase(items, id)}.`
}

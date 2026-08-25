export const TOPBAR_SLOTS: TopbarSlot[] = ['left', 'center', 'right']

export const TOPBAR_ITEMS: TopbarItemDefinition[] = [
  { id: 'system-menu', slot: 'left', kind: 'element', label: 'System menu' },
  { id: 'plugins-left', slot: 'left', kind: 'plugin-group', label: 'Plugins (left)' },
  { id: 'notice', slot: 'left', kind: 'element', label: 'Notices' },
  { id: 'launcher', slot: 'center', kind: 'element', label: 'Search' },
  { id: 'tray', slot: 'right', kind: 'element', label: 'System tray' },
  { id: 'media', slot: 'right', kind: 'element', label: 'Media' },
  { id: 'microphone', slot: 'right', kind: 'element', label: 'Microphone' },
  { id: 'status', slot: 'right', kind: 'element', label: 'Status' },
  { id: 'plugins-right', slot: 'right', kind: 'plugin-group', label: 'Plugins (right)' },
  { id: 'clock', slot: 'right', kind: 'element', label: 'Clock' },
]

export const EMPTY_TOPBAR_LAYOUT: StoredTopbarLayout = {
  slots: { left: [], center: [], right: [] },
  hidden: [],
}

export function findTopbarItem(id: string): TopbarItemDefinition | undefined {
  return TOPBAR_ITEMS.find((item) => item.id === id)
}

function storedSlotIds(stored: StoredTopbarLayout | null | undefined, slot: TopbarSlot): string[] {
  const ids = stored?.slots?.[slot]
  return Array.isArray(ids) ? ids : []
}

function acceptsItem(definition: TopbarItemDefinition, slot: TopbarSlot): boolean {
  return definition.kind !== 'plugin-group' || definition.slot === slot
}

const EARLIER_IN_CATALOGUE = -1
const LATER_IN_CATALOGUE = 1

function catalogueIndex(id: TopbarItemId): number {
  return TOPBAR_ITEMS.findIndex((item) => item.id === id)
}

function nearestNeighbourPosition(placed: TopbarItemId[], index: number, direction: -1 | 1): number {
  let position = -1
  let distance = Infinity
  placed.forEach((id, at) => {
    const gap = (catalogueIndex(id) - index) * direction
    if (gap > 0 && gap < distance) {
      distance = gap
      position = at
    }
  })
  return position
}

function catalogueInsertionPosition(placed: TopbarItemId[], id: TopbarItemId): number {
  const index = catalogueIndex(id)
  const predecessor = nearestNeighbourPosition(placed, index, EARLIER_IN_CATALOGUE)
  if (predecessor >= 0) return predecessor + 1
  const successor = nearestNeighbourPosition(placed, index, LATER_IN_CATALOGUE)
  return successor >= 0 ? successor : placed.length
}

function placeStoredItems(stored: StoredTopbarLayout | null | undefined): Record<TopbarSlot, TopbarItemId[]> {
  const bySlot: Record<TopbarSlot, TopbarItemId[]> = { left: [], center: [], right: [] }
  const placed = new Set<TopbarItemId>()

  for (const slot of TOPBAR_SLOTS) {
    for (const id of storedSlotIds(stored, slot)) {
      const definition = findTopbarItem(id)
      if (!definition || placed.has(definition.id) || !acceptsItem(definition, slot)) continue
      placed.add(definition.id)
      bySlot[slot].push(definition.id)
    }
  }
  for (const definition of TOPBAR_ITEMS) {
    if (placed.has(definition.id)) continue
    placed.add(definition.id)
    const target = bySlot[definition.slot]
    target.splice(catalogueInsertionPosition(target, definition.id), 0, definition.id)
  }

  return bySlot
}

export function resolveTopbarLayout(stored: StoredTopbarLayout | null | undefined): TopbarLayoutItem[] {
  const bySlot = placeStoredItems(stored)
  const hidden = new Set(Array.isArray(stored?.hidden) ? stored.hidden : [])

  return TOPBAR_SLOTS.flatMap((slot) =>
    bySlot[slot].map((id, order) => ({ id, slot, order, visible: !hidden.has(id) }))
  )
}

export function topbarSlotItems(items: TopbarLayoutItem[], slot: TopbarSlot): TopbarLayoutItem[] {
  return items.filter((item) => item.slot === slot)
}

export function visibleTopbarSlotItems(items: TopbarLayoutItem[], slot: TopbarSlot): TopbarLayoutItem[] {
  return topbarSlotItems(items, slot).filter((item) => item.visible)
}

export function storeTopbarLayout(items: TopbarLayoutItem[]): StoredTopbarLayout {
  return {
    slots: {
      left: topbarSlotItems(items, 'left').map((item) => item.id),
      center: topbarSlotItems(items, 'center').map((item) => item.id),
      right: topbarSlotItems(items, 'right').map((item) => item.id),
    },
    hidden: items.filter((item) => !item.visible).map((item) => item.id),
  }
}

import { topbarSlotAcceptsItem } from '../../topbar/layout/topbarLayout'

const RIDGE_STRIP_MIN_WIDTH = 704
const EDGE_SCROLL_BAND = 40
const EDGE_SCROLL_MAX_STEP = 12
const CARET_WIDTH = 2
const CARET_GAP = 2
const LEADER_INSET = 16
const LEADER_BEND_ABOVE_CALLOUT = 12

const EMPTY_LANE_CARET_X: Record<TopbarSlot, (lane: RidgeBox) => number> = {
  left: (lane) => lane.left + CARET_GAP,
  center: (lane) => middleX(lane),
  right: (lane) => lane.right - CARET_GAP,
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function middleX(box: RidgeBox): number {
  return (box.left + box.right) / 2
}

function middleY(box: RidgeBox): number {
  return (box.top + box.bottom) / 2
}

function boxContains(box: RidgeBox, point: RidgePoint): boolean {
  return point.x >= box.left && point.x < box.right && point.y >= box.top && point.y < box.bottom
}

export function ridgeLayoutMode(width: number): RidgeLayoutMode {
  return width >= RIDGE_STRIP_MIN_WIDTH ? 'strip' : 'stacked'
}

export function ridgeBoxWithin(box: RidgeBox, frame: RidgeBox): RidgeBox {
  return {
    left: box.left - frame.left,
    top: box.top - frame.top,
    right: box.right - frame.left,
    bottom: box.bottom - frame.top,
  }
}

function otherChips(lane: RidgeLaneBox, id: TopbarItemId): RidgeChipBox[] {
  return lane.chips.filter((chip) => chip.id !== id)
}

function rowTop(row: RidgeChipBox[]): number {
  return Math.min(...row.map((chip) => chip.top))
}

function rowBottom(row: RidgeChipBox[]): number {
  return Math.max(...row.map((chip) => chip.bottom))
}

function chipRows(chips: RidgeChipBox[]): RidgeChipBox[][] {
  const rows: RidgeChipBox[][] = []
  for (const chip of chips) {
    const row = rows.at(-1)
    if (row && middleY(chip) < rowBottom(row)) row.push(chip)
    else rows.push([chip])
  }
  return rows
}

function rowDistance(row: RidgeChipBox[], y: number): number {
  return Math.max(rowTop(row) - y, y - rowBottom(row), 0)
}

function nearestRowIndex(rows: RidgeChipBox[][], y: number): number {
  let nearest = 0
  rows.forEach((row, at) => {
    if (rowDistance(row, y) < rowDistance(rows[nearest], y)) nearest = at
  })
  return nearest
}

export function insertionIndexInLane(lane: RidgeLaneBox, point: RidgePoint, id: TopbarItemId): number {
  const rows = chipRows(otherChips(lane, id))
  if (rows.length === 0) return 0
  const target = nearestRowIndex(rows, point.y)
  const chipsInEarlierRows = rows.slice(0, target).reduce((count, row) => count + row.length, 0)
  return chipsInEarlierRows + rows[target].filter((chip) => middleX(chip) < point.x).length
}

export function resolveDropTarget(
  geometry: RidgeDragGeometry,
  point: RidgePoint,
  id: TopbarItemId
): RidgeDropTarget | null {
  if (geometry.hideZone && boxContains(geometry.hideZone, point)) return { kind: 'hide' }
  const lane = geometry.lanes.find((candidate) => boxContains(candidate, point))
  if (!lane) return null
  if (!topbarSlotAcceptsItem(lane.slot, id)) return { kind: 'refused', slot: lane.slot }
  return { kind: 'lane', slot: lane.slot, index: insertionIndexInLane(lane, point, id) }
}

function sameRow(first: RidgeBox, second: RidgeBox): boolean {
  return middleY(second) >= first.top && middleY(second) < first.bottom
}

function caretX(lane: RidgeLaneBox, chips: RidgeChipBox[], index: number): number {
  const previous = chips[index - 1]
  const next = chips[index]
  if (previous && next && sameRow(previous, next)) return (previous.right + next.left) / 2
  if (next) return next.left - CARET_GAP
  if (previous) return previous.right + CARET_GAP
  return EMPTY_LANE_CARET_X[lane.slot](lane)
}

function caretRow(lane: RidgeLaneBox, chips: RidgeChipBox[], index: number): RidgeBox {
  return chips[index] ?? chips[index - 1] ?? lane
}

export function caretBox(lane: RidgeLaneBox, index: number, id: TopbarItemId): RidgeBox {
  const chips = otherChips(lane, id)
  const at = clamp(index, 0, chips.length)
  const halfWidth = CARET_WIDTH / 2
  const x = clamp(caretX(lane, chips, at), lane.left + halfWidth, lane.right - halfWidth)
  const row = caretRow(lane, chips, at)
  return { left: x - halfWidth, top: row.top, right: x + halfWidth, bottom: row.bottom }
}

export function calloutOffset(chip: RidgeBox, stage: RidgeBox, calloutWidth: number): number {
  const room = Math.max(stage.right - stage.left - calloutWidth, 0)
  return Math.round(clamp(middleX(chip) - stage.left - calloutWidth / 2, 0, room))
}

function leaderLandingX(x: number, callout: RidgeBox): number {
  const inset = Math.min(LEADER_INSET, (callout.right - callout.left) / 2)
  return clamp(x, callout.left + inset, callout.right - inset)
}

export function leaderPath(chip: RidgeBox, callout: RidgeBox): string {
  const startX = Math.round(middleX(chip))
  const startY = Math.round(chip.bottom)
  const endX = Math.round(leaderLandingX(startX, callout))
  const endY = Math.round(callout.top)
  if (startX === endX) return `M ${startX} ${startY} V ${endY}`
  const bendY = Math.max(startY, endY - LEADER_BEND_ABOVE_CALLOUT)
  return `M ${startX} ${startY} V ${bendY} H ${endX} V ${endY}`
}

function edgeScrollStep(distanceFromEdge: number): number {
  const depth = Math.min(EDGE_SCROLL_BAND, EDGE_SCROLL_BAND - distanceFromEdge)
  return Math.ceil((EDGE_SCROLL_MAX_STEP * depth) / EDGE_SCROLL_BAND)
}

export function edgeScrollDelta(pointer: RidgePoint, container: RidgeBox): number {
  const fromTop = pointer.y - container.top
  if (fromTop < EDGE_SCROLL_BAND) return -edgeScrollStep(fromTop)
  const fromBottom = container.bottom - pointer.y
  if (fromBottom < EDGE_SCROLL_BAND) return edgeScrollStep(fromBottom)
  return 0
}

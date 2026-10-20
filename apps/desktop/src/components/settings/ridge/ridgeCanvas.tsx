import {
  createElement,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { TOPBAR_SLOTS, visibleTopbarSlotItems } from '../../topbar/layout/topbarLayout'
import { topbarSurface } from '../../topbar/topbarSurface'
import { useRidgeDrag } from '../../../hooks/useRidgeDrag'
import { useTopbarWidgets } from '../../../plugins/pluginRegistry'
import {
  isRidgeSpaceKey,
  nextFocusedItem,
  refusingSlotForStep,
  ridgeFocusOrder,
  ridgeKeyIntent,
  stepGrabbedPosition,
} from './ridgeKeyboard'
import {
  RIDGE_KEYBOARD_HINT,
  ridgeCancelAnnouncement,
  ridgeDropAnnouncement,
  ridgeEdgeAnnouncement,
  ridgeGrabAnnouncement,
  ridgeHiddenAnnouncement,
  ridgeMoveAnnouncement,
  ridgeRefusedAnnouncement,
  ridgeSideLabel,
} from './ridgeAnnouncements'
import { ridgeDrawsItem, ridgeItemTitle } from './ridgeItemCatalogue'
import { RIDGE_ITEM_PREVIEWS } from './ridgeItemPreviewMap'
import { ridgeItemIsSample } from './ridgeSamples'
import RidgeFit from './ridgeFit'
import RidgeStrip from './ridgeStrip'
import RidgeLane from './ridgeLane'
import RidgeChip from './ridgeChip'
import RidgeDragLayer from './ridgeDragLayer'
import RidgeAnnouncer from './ridgeAnnouncer'

const LAYOUT_MODE: RidgeLayoutMode = 'strip'
const RIDGE_BAR_FONT = 'system-ui, sans-serif'
const REPEATED_MESSAGE_MARK = ' '
const RIDGE_CHIP_SELECTOR = '[data-ridge-chip]'

function laneDropState(target: RidgeDropTarget | null, slot: TopbarSlot): RidgeLaneDropState {
  if (target?.kind === 'lane' && target.slot === slot) return 'accept'
  if (target?.kind === 'refused' && target.slot === slot) return 'refuse'
  return 'idle'
}

function neighbourOf(order: TopbarItemId[], id: TopbarItemId): TopbarItemId | null {
  const at = order.indexOf(id)
  return order[at + 1] ?? order[at - 1] ?? null
}

function freshAnnouncement(previous: string, message: string): string {
  return previous === message ? `${message}${REPEATED_MESSAGE_MARK}` : message
}

function scrollsVertically(element: Element): boolean {
  const { overflowY } = getComputedStyle(element)
  return overflowY === 'auto' || overflowY === 'scroll'
}

function nearestScroller(element: HTMLElement | null): HTMLElement | null {
  let candidate = element?.parentElement ?? null
  while (candidate && !scrollsVertically(candidate)) candidate = candidate.parentElement
  return candidate
}

function elementBox(element: Element): RidgeBox {
  const { left, top, right, bottom } = element.getBoundingClientRect()
  return { left, top, right, bottom }
}

function chipIn(stage: HTMLElement | null, id: TopbarItemId): HTMLButtonElement | null {
  return stage?.querySelector<HTMLButtonElement>(`[data-ridge-chip="${id}"]`) ?? null
}

function laneIn(stage: HTMLElement | null, slot: TopbarSlot): HTMLElement | null {
  return stage?.querySelector<HTMLElement>(`[data-ridge-lane="${slot}"]`) ?? null
}

function isOutsideEveryChip(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(RIDGE_CHIP_SELECTOR) === null
}

export default function RidgeCanvas({
  editor,
  previewData,
  openItem,
  onOpenItemChange,
  onNothingLeftToFocus,
  renderItemSettings,
  measure,
  scrollContainer,
  ref,
}: RidgeCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<TopbarItemId | null>(null)
  const spaceClick = useRef(false)
  const grabbing = useRef<TopbarItemId | null>(null)

  const [grabbedId, setGrabbedId] = useState<TopbarItemId | null>(null)
  const [arranged, setArranged] = useState<TopbarLayoutItem[] | null>(null)
  const [activeId, setActiveId] = useState<TopbarItemId | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [dragId, setDragId] = useState<TopbarItemId | null>(null)
  const [dropTarget, setDropTarget] = useState<RidgeDropTarget | null>(null)

  const settingsId = useId()
  const hintId = useId()
  const surface = topbarSurface(previewData.color)
  const liveWidgetCounts = { left: useTopbarWidgets('left').length, right: useTopbarWidgets('right').length }
  const items = arranged ?? editor.items
  const drawnItems = items.filter((item) => ridgeDrawsItem(item.id, liveWidgetCounts))
  const order = ridgeFocusOrder(drawnItems)
  const tabbableId = activeId !== null && order.includes(activeId) ? activeId : (order[0] ?? null)
  const settingsItem = openItem !== null && order.includes(openItem) ? openItem : null

  function announce(message: string) {
    setAnnouncement((previous) => freshAnnouncement(previous, message))
  }

  function chipElement(id: TopbarItemId): HTMLButtonElement | null {
    return chipIn(stageRef.current, id)
  }

  function focusItem(id: TopbarItemId) {
    const chip = chipElement(id)
    if (chip) chip.focus()
    else pendingFocus.current = id
  }

  function endGrab() {
    grabbing.current = null
    setGrabbedId(null)
    setArranged(null)
  }

  function grab(id: TopbarItemId) {
    grabbing.current = id
    setGrabbedId(id)
    setArranged(editor.items)
    announce(ridgeGrabAnnouncement(editor.items, id))
  }

  function moveGrabbed(id: TopbarItemId, step: RidgeKeyStep) {
    const current = arranged ?? editor.items
    const refused = refusingSlotForStep(current, id, step)
    if (refused) return announce(ridgeRefusedAnnouncement(id, refused))
    const next = stepGrabbedPosition(current, id, step, (itemId) => ridgeDrawsItem(itemId, liveWidgetCounts))
    if (next === current) return announce(ridgeEdgeAnnouncement(current, id))
    pendingFocus.current = id
    setArranged(next)
    announce(ridgeMoveAnnouncement(next, id))
  }

  function dropGrabbed(id: TopbarItemId) {
    const next = arranged ?? editor.items
    endGrab()
    pendingFocus.current = id
    announce(ridgeDropAnnouncement(next, id))
    editor.commit(next)
  }

  function abandonGrab(id: TopbarItemId) {
    endGrab()
    announce(ridgeCancelAnnouncement(editor.items, id))
  }

  function abandonCurrentGrab() {
    const held = grabbing.current
    if (held !== null) abandonGrab(held)
  }

  function cancelGrab(id: TopbarItemId) {
    pendingFocus.current = id
    abandonGrab(id)
  }

  function hideItem(id: TopbarItemId) {
    const neighbour = neighbourOf(order, id)
    pendingFocus.current = neighbour
    endGrab()
    if (openItem === id) onOpenItemChange(null)
    if (neighbour === null) onNothingLeftToFocus()
    editor.hide(id).then((hidden) => {
      if (hidden) announce(ridgeHiddenAnnouncement(id))
    })
  }

  function focusStep(id: TopbarItemId, step: RidgeKeyStep) {
    const next = nextFocusedItem(order, id, step)
    if (next) chipElement(next)?.focus()
  }

  function runKeyIntent(intent: RidgeKeyIntent, id: TopbarItemId) {
    switch (intent.kind) {
      case 'grab':
        return grab(id)
      case 'drop':
        return dropGrabbed(id)
      case 'cancel':
        return cancelGrab(id)
      case 'hide':
        return hideItem(id)
      case 'focus':
        return focusStep(id, intent.step)
      case 'move':
        return moveGrabbed(id, intent.step)
    }
  }

  function closeSettingsOnEscape(event: KeyboardEvent<HTMLButtonElement>, id: TopbarItemId) {
    if (event.key !== 'Escape' || settingsItem !== id) return
    event.preventDefault()
    onOpenItemChange(null)
  }

  function onChipKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: TopbarItemId) {
    const intent = ridgeKeyIntent(event, grabbedId === id)
    if (intent.kind === 'native') return closeSettingsOnEscape(event, id)
    event.preventDefault()
    if (isRidgeSpaceKey(event.key)) spaceClick.current = true
    if (event.repeat && (intent.kind === 'grab' || intent.kind === 'drop')) return
    runKeyIntent(intent, id)
  }

  function onChipKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (!spaceClick.current || !isRidgeSpaceKey(event.key)) return
    event.preventDefault()
    window.setTimeout(() => {
      spaceClick.current = false
    })
  }

  function takeSpaceClick(): boolean {
    const pressed = spaceClick.current
    spaceClick.current = false
    return pressed
  }

  function measuredChip(id: TopbarItemId): RidgeChipBox[] {
    const chip = chipElement(id)
    return chip ? [{ id, ...elementBox(chip) }] : []
  }

  function measuredLane(slot: TopbarSlot): RidgeLaneBox[] {
    const lane = laneIn(stageRef.current, slot)
    if (!lane) return []
    const chips = visibleTopbarSlotItems(editor.items, slot).flatMap((item) => measuredChip(item.id))
    return [{ slot, ...elementBox(lane), chips }]
  }

  function measureCanvas(): RidgeDragGeometry {
    return { lanes: TOPBAR_SLOTS.flatMap(measuredLane), hideZone: null }
  }

  function clearDrag() {
    setDragId(null)
    setDropTarget(null)
  }

  function layoutIndex(slot: TopbarSlot, id: TopbarItemId, drawnIndex: number): number {
    const visible = visibleTopbarSlotItems(
      editor.items.filter((item) => item.id !== id),
      slot
    )
    const anchor = visible.filter((item) => ridgeDrawsItem(item.id, liveWidgetCounts))[drawnIndex]
    return anchor ? visible.indexOf(anchor) : visible.length
  }

  function applyDrop(id: TopbarItemId, target: RidgeDropTarget) {
    if (target.kind === 'hide') return hideItem(id)
    if (target.kind === 'refused') return announce(ridgeRefusedAnnouncement(id, target.slot))
    pendingFocus.current = id
    editor.move(id, { slot: target.slot, index: layoutIndex(target.slot, id, target.index) })
  }

  function finishDrag(id: TopbarItemId, target: RidgeDropTarget | null) {
    clearDrag()
    if (target) applyDrop(id, target)
  }

  const drag = useRidgeDrag({
    measure: measure ?? measureCanvas,
    scrollContainer: scrollContainer ?? (() => nearestScroller(stageRef.current)),
    ghost: ghostRef,
    caret: caretRef,
    onLift: setDragId,
    onTarget: setDropTarget,
    onDrop: finishDrag,
    onCancel: clearDrag,
  })

  function onChipPointerDown(event: PointerEvent<HTMLButtonElement>, id: TopbarItemId) {
    pendingFocus.current = null
    abandonCurrentGrab()
    drag.start(event, id)
  }

  function onChipClick(id: TopbarItemId) {
    const dragged = drag.takeSuppressedClick()
    const pressedSpace = takeSpaceClick()
    if (dragged || pressedSpace) return
    onOpenItemChange(openItem === id ? null : id)
  }

  function onStageBlur(event: FocusEvent<HTMLDivElement>) {
    if (isOutsideEveryChip(event.relatedTarget)) abandonCurrentGrab()
  }

  useImperativeHandle(ref, () => ({ focusItem, abandonGrab: abandonCurrentGrab, announce }))

  useLayoutEffect(() => {
    const id = pendingFocus.current
    const chip = id === null ? null : chipIn(stageRef.current, id)
    if (!chip) return
    pendingFocus.current = null
    if (document.activeElement !== chip) chip.focus()
  })

  function preview(id: TopbarItemId) {
    return createElement(RIDGE_ITEM_PREVIEWS[id], { data: previewData, darkText: surface.darkText })
  }

  function renderChip(id: TopbarItemId) {
    const expanded = settingsItem === id
    return (
      <RidgeChip
        key={id}
        id={id}
        label={ridgeItemTitle(id, previewData)}
        darkText={surface.darkText}
        tabbable={id === tabbableId}
        expanded={expanded}
        grabbed={grabbedId === id}
        controls={expanded ? settingsId : undefined}
        lifted={dragId === id}
        sample={ridgeItemIsSample(id, previewData)}
        describedBy={hintId}
        onClick={() => onChipClick(id)}
        onKeyDown={(event) => onChipKeyDown(event, id)}
        onKeyUp={onChipKeyUp}
        onPointerDown={(event) => onChipPointerDown(event, id)}
        onFocus={() => setActiveId(id)}
      >
        {preview(id)}
      </RidgeChip>
    )
  }

  function renderLane(slot: TopbarSlot) {
    return (
      <RidgeLane
        key={slot}
        slot={slot}
        label={ridgeSideLabel(slot)}
        mode={LAYOUT_MODE}
        surface={surface}
        dropState={laneDropState(dropTarget, slot)}
        moving={dragId !== null || grabbedId !== null}
      >
        {visibleTopbarSlotItems(drawnItems, slot).map((item) => renderChip(item.id))}
      </RidgeLane>
    )
  }

  const lanes = { left: renderLane('left'), center: renderLane('center'), right: renderLane('right') }

  return (
    <div
      ref={stageRef}
      data-layout-mode={LAYOUT_MODE}
      onBlur={onStageBlur}
      className={`relative flex w-full flex-col gap-section ${dragId ? 'cursor-grabbing' : ''}`}
    >
      <div data-ridge-strip-area className="select-none rounded-card bg-fill-ghost px-4 py-6" style={{ fontFamily: RIDGE_BAR_FONT }}>
        <RidgeFit>
          <RidgeStrip surface={surface} lanes={lanes} />
        </RidgeFit>
        <RidgeDragLayer surface={surface} ghost={dragId ? preview(dragId) : null} ghostRef={ghostRef} caretRef={caretRef} />
      </div>
      {settingsItem && <div id={settingsId}>{renderItemSettings(settingsItem)}</div>}
      <p id={hintId} className="sr-only">
        {RIDGE_KEYBOARD_HINT}
      </p>
      <RidgeAnnouncer message={announcement} />
    </div>
  )
}

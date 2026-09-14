import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CirclePlus, Palette, RotateCcw } from 'lucide-react'
import { Button, ConfirmButton, IconButton, PageHeader } from '@alpine/ui'
import { settingsPage, settingsPageRoute } from '../../settings/registry'
import { highlightedSetting, onHighlightedSetting } from '../../hooks/useHighlightedSetting'
import { useRidgeEditor } from '../../hooks/useRidgeEditor'
import { useRidgePreviewData } from '../../hooks/useRidgePreviewData'
import {
  EMPTY_TOPBAR_LAYOUT,
  TOPBAR_SLOTS,
  resolveTopbarLayout,
  topbarSlotAcceptsItem,
  visibleTopbarSlotItems,
} from '../topbar/layout/topbarLayout'
import { stepTopbarItem } from '../topbar/layout/topbarLayoutEdits'
import { ridgeHiddenAnnouncement, ridgeShownAnnouncement } from './ridge/ridgeAnnouncements'
import { ridgeHighlightRing } from './ridge/ridgeHighlight'
import { ridgeItemForSetting } from './ridge/ridgeItemCatalogue'
import { nextFocusedItem, ridgeFocusOrder } from './ridge/ridgeKeyboard'
import RidgeAddMenu from './ridge/ridgeAddMenu'
import RidgeCallout from './ridge/ridgeCallout'
import RidgeCanvas from './ridge/ridgeCanvas'
import RidgeHiddenItemNotice from './ridge/ridgeHiddenItemNotice'

const RESET_SETTING = 'ridge-layout-reset'

const PAGE_SUBTITLE = 'Drag an item to move it, or click it for its settings.'

const ADD_LABEL = 'Add to Ridge'

const APPEARANCE_LABEL = 'Color and theme'

const CHANGES_CAPTION = 'Changes reach Ridge on every monitor as soon as you make them.'

const RESET_LABEL = 'Reset Ridge'

const RESET_CONFIRM_LABEL = 'Reset to default'

const FIRST_ITEM_AFTER_RESET = ridgeFocusOrder(resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT))[0]

function calloutForHighlight(settingId: string | null): TopbarItemId | null {
  return settingId === null ? null : ridgeItemForSetting(settingId)
}

function hiddenItemIds(items: TopbarLayoutItem[]): TopbarItemId[] {
  return items.filter((item) => !item.visible).map((item) => item.id)
}

function isShownOnRidge(items: TopbarLayoutItem[], id: TopbarItemId): boolean {
  return items.some((item) => item.id === id && item.visible)
}

function hiddenOpenItem(items: TopbarLayoutItem[], openItem: TopbarItemId | null): TopbarItemId | null {
  return openItem !== null && !isShownOnRidge(items, openItem) ? openItem : null
}

function sidesFor(id: TopbarItemId): TopbarSlot[] {
  return TOPBAR_SLOTS.filter((slot) => topbarSlotAcceptsItem(slot, id))
}

function canStep(items: TopbarLayoutItem[], id: TopbarItemId, direction: TopbarStepDirection): boolean {
  return stepTopbarItem(items, id, direction) !== items
}

function sideTarget(items: TopbarLayoutItem[], item: TopbarLayoutItem, slot: TopbarSlot): TopbarItemTarget {
  const arrivesFromTheLeft = TOPBAR_SLOTS.indexOf(item.slot) < TOPBAR_SLOTS.indexOf(slot)
  return { slot, index: arrivesFromTheLeft ? 0 : visibleTopbarSlotItems(items, slot).length }
}

function neighbourOnceHidden(items: TopbarLayoutItem[], id: TopbarItemId): TopbarItemId | null {
  const order = ridgeFocusOrder(items)
  const candidates = [nextFocusedItem(order, id, 'later'), nextFocusedItem(order, id, 'earlier')]
  return candidates.find((candidate) => candidate !== null && candidate !== id) ?? null
}

function buttonIn(anchor: HTMLElement | null): HTMLButtonElement | null {
  return anchor?.querySelector('button') ?? null
}

export default function RidgePage({ onNavigate }: RidgePageProps) {
  const previewData = useRidgePreviewData()
  const editor = useRidgeEditor()
  const canvas = useRef<RidgeCanvasHandle>(null)
  const addAnchor = useRef<HTMLDivElement>(null)
  const resetAnchor = useRef<HTMLDivElement>(null)
  const addMenuId = useId()
  const [openItem, setOpenItem] = useState(() => calloutForHighlight(highlightedSetting()))
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const highlight = useSyncExternalStore(onHighlightedSetting, highlightedSetting)
  const resetUnavailable = editor.isDefault || resetting
  const appearanceRoute = settingsPageRoute('appearance')
  const hiddenItem = hiddenOpenItem(editor.items, openItem)

  useEffect(
    () =>
      onHighlightedSetting((settingId) => {
        const item = calloutForHighlight(settingId)
        if (item) setOpenItem(item)
      }),
    []
  )

  useLayoutEffect(() => {
    if (highlight === RESET_SETTING && !resetUnavailable) buttonIn(resetAnchor.current)?.focus()
  }, [highlight, resetUnavailable])

  function focusAddButton() {
    buttonIn(addAnchor.current)?.focus()
  }

  function abandonCanvasGrab() {
    canvas.current?.abandonGrab()
  }

  function announceOnCanvas(message: string) {
    canvas.current?.announce(message)
  }

  function closeCallout(id: TopbarItemId) {
    setOpenItem(null)
    canvas.current?.focusItem(id)
  }

  function moveToSide(item: TopbarLayoutItem, slot: TopbarSlot) {
    abandonCanvasGrab()
    editor.move(item.id, sideTarget(editor.items, item, slot))
  }

  function stepFromCallout(id: TopbarItemId, direction: TopbarStepDirection) {
    abandonCanvasGrab()
    editor.step(id, direction)
  }

  function hideFromCallout(id: TopbarItemId) {
    abandonCanvasGrab()
    const neighbour = neighbourOnceHidden(editor.items, id)
    setOpenItem(null)
    if (neighbour) canvas.current?.focusItem(neighbour)
    else focusAddButton()
    editor.hide(id).then((hidden) => {
      if (hidden) announceOnCanvas(ridgeHiddenAnnouncement(id))
    })
  }

  function closeHiddenItemNotice() {
    setOpenItem(null)
    focusAddButton()
  }

  function dismissAddMenu() {
    setAdding(false)
    focusAddButton()
  }

  function addItem(id: TopbarItemId) {
    setAdding(false)
    editor.show(id).then((shown) => {
      if (!shown) return focusAddButton()
      announceOnCanvas(ridgeShownAnnouncement(editor.items, id))
      setOpenItem(id)
      canvas.current?.focusItem(id)
    })
  }

  function resetRidge() {
    setOpenItem(null)
    setResetting(true)
    editor.reset().then((reset) => {
      setResetting(false)
      if (reset) canvas.current?.focusItem(FIRST_ITEM_AFTER_RESET)
    })
  }

  function renderCallout(id: TopbarItemId) {
    const item = editor.items.find((candidate) => candidate.id === id)
    if (!item) return null
    return (
      <RidgeCallout
        item={item}
        previewData={previewData}
        highlightedSetting={highlight}
        sides={sidesFor(id)}
        canStepEarlier={canStep(editor.items, id, 'earlier')}
        canStepLater={canStep(editor.items, id, 'later')}
        onSide={(slot) => moveToSide(item, slot)}
        onStep={(direction) => stepFromCallout(id, direction)}
        onHide={() => hideFromCallout(id)}
        onNavigate={onNavigate}
        onClose={() => closeCallout(id)}
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-section">
      <PageHeader title={settingsPage('ridge')?.label ?? ''} subtitle={PAGE_SUBTITLE}>
        {appearanceRoute !== null && (
          <Button variant="outline" size="sm" icon={<Palette size={14} />} onClick={() => onNavigate(appearanceRoute)}>
            {APPEARANCE_LABEL}
          </Button>
        )}
        <div ref={addAnchor} className="flex">
          <IconButton
            label={ADD_LABEL}
            aria-expanded={adding}
            aria-controls={adding ? addMenuId : undefined}
            onClick={() => setAdding((open) => !open)}
          >
            <CirclePlus size={16} />
          </IconButton>
        </div>
      </PageHeader>
      {adding && (
        <div className="flex justify-end">
          <RidgeAddMenu
            id={addMenuId}
            items={hiddenItemIds(editor.items)}
            onSelect={addItem}
            onDismiss={dismissAddMenu}
            onNavigate={onNavigate}
          />
        </div>
      )}
      <RidgeCanvas
        ref={canvas}
        editor={editor}
        previewData={previewData}
        openItem={openItem}
        onOpenItemChange={setOpenItem}
        onNothingLeftToFocus={focusAddButton}
        renderCallout={renderCallout}
      />
      {hiddenItem !== null && (
        <RidgeHiddenItemNotice item={hiddenItem} onAdd={() => addItem(hiddenItem)} onClose={closeHiddenItemNotice} />
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs text-ink-quiet">{CHANGES_CAPTION}</p>
          {editor.error && (
            <p role="alert" className="text-xs text-danger">
              {editor.error}
            </p>
          )}
        </div>
        <div
          ref={resetAnchor}
          data-setting={RESET_SETTING}
          className={`flex shrink-0 rounded-full transition-colors duration-300 ${ridgeHighlightRing(highlight === RESET_SETTING)}`}
        >
          <ConfirmButton
            label={RESET_LABEL}
            confirmLabel={RESET_CONFIRM_LABEL}
            icon={<RotateCcw size={14} />}
            busy={resetting}
            disabled={editor.isDefault}
            onConfirm={resetRidge}
          />
        </div>
      </footer>
    </div>
  )
}

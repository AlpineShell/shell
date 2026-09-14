import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CirclePlus, RotateCcw } from 'lucide-react'
import { ConfirmButton, IconButton, PageHeader } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { highlightedSetting, onHighlightedSetting } from '../../hooks/useHighlightedSetting'
import { useRidgeEditor } from '../../hooks/useRidgeEditor'
import { useRidgePreviewData } from '../../hooks/useRidgePreviewData'
import { useRidgeLivePlugins } from '../../hooks/useRidgeLivePlugins'
import { useOutsidePointer } from '../../hooks/useOutsidePointer'
import { EMPTY_TOPBAR_LAYOUT, resolveTopbarLayout } from '../topbar/layout/topbarLayout'
import { stepTopbarItemPast } from '../topbar/layout/topbarLayoutEdits'
import { useTopbarWidgets } from '../../plugins/pluginRegistry'
import { ridgeHiddenAnnouncement, ridgeShownAnnouncement } from './ridge/ridgeAnnouncements'
import { ridgeHighlightRing } from './ridge/ridgeHighlight'
import { ridgeCanAddItem, ridgeDrawsItem, ridgeItemForSetting } from './ridge/ridgeItemCatalogue'
import { nextFocusedItem, ridgeFocusOrder } from './ridge/ridgeKeyboard'
import RidgeAddMenu from './ridge/ridgeAddMenu'
import RidgeCallout from './ridge/ridgeCallout'
import RidgeCanvas from './ridge/ridgeCanvas'
import RidgeColorSection from './ridge/ridgeColorSection'
import RidgeHiddenItemNotice from './ridge/ridgeHiddenItemNotice'

const RESET_SETTING = 'ridge-layout-reset'

const PAGE_SUBTITLE = 'Drag an item to move it, or click it for its settings.'

const ADD_LABEL = 'Add to Ridge'

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

function canStep(
  items: TopbarLayoutItem[],
  id: TopbarItemId,
  direction: TopbarStepDirection,
  isDrawn: (id: TopbarItemId) => boolean
): boolean {
  return stepTopbarItemPast(items, id, direction, isDrawn) !== items
}

function neighbourOnceHidden(items: TopbarLayoutItem[], id: TopbarItemId): TopbarItemId | null {
  const order = ridgeFocusOrder(items)
  const candidates = [nextFocusedItem(order, id, 'later'), nextFocusedItem(order, id, 'earlier')]
  return candidates.find((candidate) => candidate !== null && candidate !== id) ?? null
}

function buttonIn(anchor: HTMLElement | null): HTMLButtonElement | null {
  return anchor?.querySelector('button') ?? null
}

export default function RidgePage({ onNavigate, initialItem }: RidgePageProps) {
  const previewData = useRidgePreviewData()
  useRidgeLivePlugins()
  const editor = useRidgeEditor()
  const liveWidgetCounts = { left: useTopbarWidgets('left').length, right: useTopbarWidgets('right').length }
  const isDrawn = (id: TopbarItemId) => ridgeDrawsItem(id, liveWidgetCounts)
  const canvas = useRef<RidgeCanvasHandle>(null)
  const addAnchor = useRef<HTMLDivElement>(null)
  const resetAnchor = useRef<HTMLDivElement>(null)
  const addMenuId = useId()
  const [openItem, setOpenItem] = useState(() => calloutForHighlight(highlightedSetting()) ?? initialItem ?? null)
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const highlight = useSyncExternalStore(onHighlightedSetting, highlightedSetting)
  const resetUnavailable = editor.isDefault || resetting
  const hiddenItem = hiddenOpenItem(editor.items, openItem)
  const addableItems = hiddenItemIds(editor.items).filter((id) => ridgeCanAddItem(id, previewData))

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

  useOutsidePointer(addAnchor, adding, closeAddMenu)

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

  function stepFromCallout(id: TopbarItemId, direction: TopbarStepDirection) {
    abandonCanvasGrab()
    editor.step(id, direction, isDrawn)
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

  function closeAddMenu() {
    setAdding(false)
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
        canStepEarlier={canStep(editor.items, id, 'earlier', isDrawn)}
        canStepLater={canStep(editor.items, id, 'later', isDrawn)}
        onStep={(direction) => stepFromCallout(id, direction)}
        onHide={() => hideFromCallout(id)}
        onNavigate={onNavigate}
        onClose={() => closeCallout(id)}
      />
    )
  }

  return (
    <div className="relative flex w-full flex-1 flex-col gap-section">
      <div>
        <PageHeader title={settingsPage('ridge')?.label ?? ''} subtitle={PAGE_SUBTITLE}>
          <div
            ref={resetAnchor}
            data-setting={RESET_SETTING}
            className={`flex rounded-field transition-colors duration-300 ${ridgeHighlightRing(highlight === RESET_SETTING)}`}
          >
            <ConfirmButton
              iconOnly
              confirmOnly
              label={RESET_LABEL}
              confirmLabel={RESET_CONFIRM_LABEL}
              icon={<RotateCcw size={16} />}
              busy={resetting}
              disabled={editor.isDefault}
              onConfirm={resetRidge}
            />
          </div>
          <div ref={addAnchor} className="relative flex">
            <IconButton
              label={ADD_LABEL}
              aria-expanded={adding}
              aria-controls={adding ? addMenuId : undefined}
              onClick={() => setAdding((open) => !open)}
            >
              <CirclePlus size={16} />
            </IconButton>
            {adding && (
              <div className="absolute top-full right-0 z-40 mt-2 w-88">
                <RidgeAddMenu id={addMenuId} items={addableItems} previewData={previewData} onSelect={addItem} onDismiss={dismissAddMenu} />
              </div>
            )}
          </div>
        </PageHeader>
      </div>
      <div className="flex flex-col">
        <RidgeCanvas
          ref={canvas}
          editor={editor}
          previewData={previewData}
          openItem={openItem}
          onOpenItemChange={setOpenItem}
          onNothingLeftToFocus={focusAddButton}
          renderCallout={renderCallout}
        />
      </div>
      <RidgeColorSection />
      {hiddenItem !== null && (
        <RidgeHiddenItemNotice item={hiddenItem} onAdd={() => addItem(hiddenItem)} onClose={closeHiddenItemNotice} />
      )}
      {editor.error && (
        <p role="alert" className="text-xs text-danger">
          {editor.error}
        </p>
      )}
    </div>
  )
}

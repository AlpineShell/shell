import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, Trash2, X } from 'lucide-react'
import { Card, IconButton } from '@alpine/ui'
import { settingsEntry, settingsPageRoute } from '../../../settings/registry'
import { entryRowContent, registryPageRendersEntry } from '../registryRowContent'
import { ridgeHighlightRing } from './ridgeHighlight'
import { RIDGE_ITEM_DETAILS, ridgeItemEntries, ridgeItemSearchEntryId, ridgeItemTitle } from './ridgeItemCatalogue'

const WIDE_CONTROLS_STACKED = true

function settingRowClass(highlighted: boolean): string {
  return `-mx-2 rounded-field px-2 py-1.5 transition-colors duration-300 ${ridgeHighlightRing(highlighted)}`
}

export default function RidgeCallout(props: RidgeCalloutProps) {
  const { item, previewData, onClose } = props

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      role="region"
      aria-label={`${ridgeItemTitle(item.id, previewData)} settings`}
      onKeyDown={closeOnEscape}
      className="w-full max-w-[22rem]"
    >
      <Card className="flex flex-col gap-4 p-4">
        <CalloutHeader {...props} />
        <CalloutSettings {...props} />
        <CalloutLinks {...props} />
        <CalloutNote {...props} />
        <CalloutActions {...props} />
      </Card>
    </div>
  )
}

function CalloutHeader({ item, previewData, onClose }: RidgeCalloutProps) {
  const Icon = settingsEntry(ridgeItemSearchEntryId(item.id))?.icon
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={16} className="shrink-0 text-ink-quiet" />}
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{ridgeItemTitle(item.id, previewData)}</h3>
      <IconButton label="Close" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  )
}

function CalloutSettings({ item, highlightedSetting }: RidgeCalloutProps) {
  const highlightedRow = useRef<HTMLDivElement>(null)

  useEffect(() => {
    highlightedRow.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightedSetting])

  const entries = ridgeItemEntries(item.id).filter(registryPageRendersEntry)
  if (entries.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => {
        const highlighted = entry.id === highlightedSetting
        return (
          <div
            key={entry.id}
            ref={highlighted ? highlightedRow : null}
            data-setting={entry.id}
            className={settingRowClass(highlighted)}
          >
            {entryRowContent(entry, entry.description, WIDE_CONTROLS_STACKED)}
          </div>
        )
      })}
    </div>
  )
}

function CalloutLinks({ item, previewData, onNavigate }: RidgeCalloutProps) {
  const links = RIDGE_ITEM_DETAILS[item.id].links
  if (links.length === 0) return null
  return (
    <div className="flex flex-col">
      {links.map((link) => {
        const route = settingsPageRoute(link.page)
        if (route === null) return null
        const detail = link.detail?.(previewData) ?? null
        return (
          <button
            key={link.page}
            type="button"
            onClick={() => onNavigate(route)}
            className="focus-ring -mx-2 flex cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-left transition-colors hover:bg-fill-ghost"
          >
            <span className="min-w-0 flex-1 truncate text-dense text-ink-primary">{link.label}</span>
            {detail && <span className="shrink-0 text-xs text-ink-quiet">{detail}</span>}
            <ChevronRight size={14} className="shrink-0 text-ink-faint" />
          </button>
        )
      })}
    </div>
  )
}

function CalloutNote({ item, previewData }: RidgeCalloutProps) {
  const note = RIDGE_ITEM_DETAILS[item.id].note(previewData)
  return note === null ? null : <p className="text-xs text-ink-quiet">{note}</p>
}

function CalloutActions({ canStepEarlier, canStepLater, onStep, onHide }: RidgeCalloutProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <IconButton label="Move earlier" disabled={!canStepEarlier} onClick={() => onStep('earlier')}>
          <ArrowLeft size={15} />
        </IconButton>
        <IconButton label="Move later" disabled={!canStepLater} onClick={() => onStep('later')}>
          <ArrowRight size={15} />
        </IconButton>
      </div>
      <IconButton label="Remove from Ridge" variant="danger" onClick={onHide}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  )
}

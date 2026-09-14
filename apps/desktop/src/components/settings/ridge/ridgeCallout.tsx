import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, EyeOff, Puzzle, X } from 'lucide-react'
import { Button, Card, IconButton, Segmented, type SegmentedOption } from '@alpine/ui'
import { settingsEntry, settingsPageRoute } from '../../../settings/registry'
import { topbarItemLabel } from '../../topbar/layout/topbarLayout'
import { entryRowContent, registryPageRendersEntry } from '../registryRowContent'
import { ridgeSideLabel } from './ridgeAnnouncements'
import { ridgeHighlightRing } from './ridgeHighlight'
import { RIDGE_ITEM_DETAILS, ridgeItemEntries, ridgeItemSearchEntryId, ridgePluginGroupWidgets } from './ridgeItemCatalogue'

const WIDE_CONTROLS_STACKED = true

function settingRowClass(highlighted: boolean): string {
  return `-mx-2 rounded-field px-2 py-1.5 transition-colors duration-300 ${ridgeHighlightRing(highlighted)}`
}

function sideOption(slot: TopbarSlot): SegmentedOption<TopbarSlot> {
  return { value: slot, label: ridgeSideLabel(slot) }
}

function fixedSideText(slot: TopbarSlot): string {
  return `Always on the ${ridgeSideLabel(slot).toLowerCase()}. Plugin groups stay on their own side.`
}

export default function RidgeCallout(props: RidgeCalloutProps) {
  const { item, onClose } = props

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      role="region"
      aria-label={`${topbarItemLabel(item.id)} settings`}
      onKeyDown={closeOnEscape}
      className="w-full max-w-[22rem]"
    >
      <Card className="flex flex-col gap-4 p-4">
        <CalloutHeader {...props} />
        <CalloutSettings {...props} />
        <CalloutWidgets {...props} />
        <CalloutLinks {...props} />
        <CalloutNote {...props} />
        <CalloutPlacement {...props} />
      </Card>
    </div>
  )
}

function CalloutHeader({ item, onClose }: RidgeCalloutProps) {
  const Icon = settingsEntry(ridgeItemSearchEntryId(item.id))?.icon
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={16} className="shrink-0 text-ink-quiet" />}
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{topbarItemLabel(item.id)}</h3>
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

function CalloutWidgets({ item, previewData }: RidgeCalloutProps) {
  const widgets = ridgePluginGroupWidgets(item.id, previewData)
  if (!widgets || widgets.length === 0) return null
  return (
    <ul aria-label="Plugin widgets" className="flex flex-col gap-1.5">
      {widgets.map((widget) => (
        <li key={widget.id} className="flex min-w-0 items-center gap-2 text-dense text-ink-primary">
          <Puzzle size={14} className="shrink-0 text-ink-quiet" />
          <span className="truncate">{widget.pluginName}</span>
        </li>
      ))}
    </ul>
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

function CalloutPlacement({ item, sides, canStepEarlier, canStepLater, onSide, onStep, onHide }: RidgeCalloutProps) {
  function chooseSide(slot: TopbarSlot) {
    if (slot !== item.slot) onSide(slot)
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line-hairline pt-3">
      <h4 className="text-xs font-medium text-ink-quiet">Placement</h4>
      {sides.length > 1 ? (
        <Segmented label="Side" options={sides.map(sideOption)} value={item.slot} onChange={chooseSide} />
      ) : (
        <p className="text-xs text-ink-quiet">{fixedSideText(item.slot)}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={<ArrowLeft size={14} />}
          disabled={!canStepEarlier}
          onClick={() => onStep('earlier')}
        >
          Move earlier
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<ArrowRight size={14} />}
          disabled={!canStepLater}
          onClick={() => onStep('later')}
        >
          Move later
        </Button>
        <Button variant="ghost" size="sm" icon={<EyeOff size={14} />} onClick={onHide} className="ml-auto">
          Hide
        </Button>
      </div>
    </div>
  )
}

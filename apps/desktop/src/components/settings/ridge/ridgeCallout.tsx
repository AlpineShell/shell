import { useEffect, useRef, type ComponentType, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, Trash2, X } from 'lucide-react'
import { Card, IconButton, InfoTip } from '@alpine/ui'
import { settingsEntry, settingsPageRoute } from '../../../settings/registry'
import { entryRowContent, registryPageRendersEntry } from '../registryRowContent'
import PluginSettingRows from '../pluginSettingRows'
import RidgeCalendarAccount from './ridgeCalendarAccount'
import { ridgeHighlightRing } from './ridgeHighlight'
import {
  RIDGE_ITEM_DETAILS,
  ridgeItemEntries,
  ridgeItemPluginIcon,
  ridgeItemSearchEntryId,
  ridgeItemTitle,
  ridgePluginSettingGroups,
} from './ridgeItemCatalogue'

const RIDGE_ITEM_PANELS: Partial<Record<TopbarItemId, ComponentType>> = {
  clock: RidgeCalendarAccount,
}

const WIDE_CONTROLS_STACKED = true

const NO_DESCRIPTION = ''

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
        <CalloutPluginSettings {...props} />
        <CalloutPanel {...props} />
        <CalloutLinks {...props} />
        <CalloutActions {...props} />
      </Card>
    </div>
  )
}

function CalloutPanel({ item }: RidgeCalloutProps) {
  const Panel = RIDGE_ITEM_PANELS[item.id]
  return Panel ? <Panel /> : null
}

function CalloutHeader({ item, previewData, onClose }: RidgeCalloutProps) {
  const Icon = settingsEntry(ridgeItemSearchEntryId(item.id))?.icon
  const pluginIcon = ridgeItemPluginIcon(item.id, previewData)
  const note = RIDGE_ITEM_DETAILS[item.id].note(previewData)
  return (
    <div className="flex items-center gap-2">
      {pluginIcon ? (
        <img src={pluginIcon} alt="" className="size-4 shrink-0 rounded-sm object-contain" />
      ) : (
        Icon && <Icon size={16} className="shrink-0 text-ink-quiet" />
      )}
      <div className="flex min-w-0 flex-1 items-start gap-1">
        <h3 className="min-w-0 truncate text-sm font-semibold text-ink-primary">{ridgeItemTitle(item.id, previewData)}</h3>
        {note && <InfoTip text={note} />}
      </div>
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
            {entryRowContent(entry, NO_DESCRIPTION, WIDE_CONTROLS_STACKED, entry.description)}
          </div>
        )
      })}
    </div>
  )
}

function CalloutPluginSettings({ item, previewData }: RidgeCalloutProps) {
  const groups = ridgePluginSettingGroups(item.id, previewData)
  if (groups.length === 0) return null

  if (groups.length === 1) {
    return (
      <div className="flex flex-col gap-2">
        <PluginSettingRows pluginId={groups[0].pluginId} settings={groups[0].settings} wideControlStacked={WIDE_CONTROLS_STACKED} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.pluginId} role="group" aria-label={group.pluginName} className="flex flex-col gap-2">
          <h4 className="text-eyebrow uppercase text-ink-faint select-none">{group.pluginName}</h4>
          <PluginSettingRows pluginId={group.pluginId} settings={group.settings} wideControlStacked={WIDE_CONTROLS_STACKED} />
        </div>
      ))}
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

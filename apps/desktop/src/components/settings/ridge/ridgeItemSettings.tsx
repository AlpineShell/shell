import { useEffect, useRef, type ComponentType } from 'react'
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { Button, Card, NavRow, Section } from '@alpine/ui'
import { settingsPageRoute } from '../../../settings/registry'
import { entryRowContent, registryPageRendersEntry } from '../registryRowContent'
import PluginSettingRows from '../pluginSettingRows'
import RidgeCalendarAccount from './ridgeCalendarAccount'
import { ridgeHighlightRing } from './ridgeHighlight'
import { RIDGE_ITEM_DETAILS, ridgeItemEntries, ridgeItemTitle, ridgePluginSettingGroups } from './ridgeItemCatalogue'

const RIDGE_ITEM_PANELS: Partial<Record<TopbarItemId, ComponentType>> = {
  clock: RidgeCalendarAccount,
}

export default function RidgeItemSettings(props: RidgeItemSettingsProps) {
  const { item, previewData } = props
  const title = ridgeItemTitle(item.id, previewData)
  const pluginGroups = ridgePluginSettingGroups(item.id, previewData)
  const sharedPluginGroup = pluginGroups.length === 1 ? pluginGroups[0] : null

  return (
    <div role="region" aria-label={`${title} settings`} className="flex flex-col gap-section">
      <Section variant="label" title={title}>
        <Card variant="group">
          <ItemSettingRows {...props} />
          {sharedPluginGroup && <PluginSettingRows pluginId={sharedPluginGroup.pluginId} settings={sharedPluginGroup.settings} />}
          <ItemPanel item={item} />
          <ItemLinks {...props} />
          <ItemActions {...props} />
        </Card>
      </Section>
      {pluginGroups.length > 1 &&
        pluginGroups.map((group) => (
          <div key={group.pluginId} role="group" aria-label={group.pluginName}>
            <Section variant="label" title={group.pluginName}>
              <Card variant="group">
                <PluginSettingRows pluginId={group.pluginId} settings={group.settings} />
              </Card>
            </Section>
          </div>
        ))}
    </div>
  )
}

function ItemPanel({ item }: { item: TopbarLayoutItem }) {
  const Panel = RIDGE_ITEM_PANELS[item.id]
  return Panel ? <Panel /> : null
}

function ItemSettingRows({ item, highlightedSetting }: RidgeItemSettingsProps) {
  const highlightedRow = useRef<HTMLDivElement>(null)

  useEffect(() => {
    highlightedRow.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightedSetting])

  return ridgeItemEntries(item.id)
    .filter(registryPageRendersEntry)
    .map((entry) => {
      const highlighted = entry.id === highlightedSetting
      return (
        <div
          key={entry.id}
          ref={highlighted ? highlightedRow : null}
          data-setting={entry.id}
          className={`transition-colors duration-300 ${ridgeHighlightRing(highlighted)}`}
        >
          {entryRowContent(entry, entry.description)}
        </div>
      )
    })
}

function ItemLinks({ item, previewData, onNavigate }: RidgeItemSettingsProps) {
  return RIDGE_ITEM_DETAILS[item.id].links.map((link) => {
    const route = settingsPageRoute(link.page)
    if (route === null) return null
    return (
      <NavRow
        key={link.page}
        variant="flat"
        label={link.label}
        detail={link.detail?.(previewData) ?? undefined}
        onClick={() => onNavigate(route)}
      />
    )
  })
}

function ItemActions({ canStepEarlier, canStepLater, onStep, onHide }: RidgeItemSettingsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button shape="square" variant="soft" size="sm" icon={<ArrowLeft size={14} />} disabled={!canStepEarlier} onClick={() => onStep('earlier')}>
        Move earlier
      </Button>
      <Button shape="square" variant="soft" size="sm" icon={<ArrowRight size={14} />} disabled={!canStepLater} onClick={() => onStep('later')}>
        Move later
      </Button>
      <Button shape="square" variant="dangerSoft" size="sm" icon={<Trash2 size={14} />} onClick={onHide} className="ml-auto">
        Remove from Ridge
      </Button>
    </div>
  )
}

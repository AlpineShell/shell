import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { SETTINGS_PAGE_GROUP, SETTINGS_REGISTRY, isSettingsValueEntry, settingsPage } from '../../settings/registry'
import { useHighlightedSetting } from '../../hooks/useHighlightedSetting'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import Slider from '../ui/slider'
import Select from '../ui/select'
import Segmented from '../ui/segmented'
import Button from '../ui/button'
import HotkeyRecorder from './hotkeyRecorder'

interface PlacedItem {
  key: string
  group: string
  order: number
  content: ReactNode
}

interface PlacedGroup {
  name: string
  order: number
  items: PlacedItem[]
}

export default function RegistryPage({
  page,
  slots = [],
  hidden = [],
  lead,
  groupSubtitles = {},
  entryDescriptions = {},
}: RegistryPageProps) {
  const definition = settingsPage(page)
  const omitted = new Set([...hidden, ...slots.flatMap((slot) => slot.replaces ?? [])])
  const groups = groupItems([
    ...entryItems(page, omitted, entryDescriptions),
    ...slotItems(slots),
  ])

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle title={definition?.label ?? ''} />
      {lead}
      {groups.map((group) => (
        <Section key={group.name} title={group.name} subtitle={groupSubtitles[group.name]}>
          <div className="flex flex-col gap-3">
            {group.items.map((item) => (
              <Fragment key={item.key}>{item.content}</Fragment>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

function entryItems(page: SettingsPageId, omitted: Set<string>, descriptions: Record<string, string>): PlacedItem[] {
  return SETTINGS_REGISTRY.filter(
    (entry) => entry.page === page && entry.group !== SETTINGS_PAGE_GROUP && !omitted.has(entry.id)
  ).map((entry) => ({
    key: entry.id,
    group: entry.group,
    order: entry.order,
    content: <HighlightedEntry entry={entry} description={descriptions[entry.id] ?? entry.description} />,
  }))
}

function slotItems(slots: SettingsPageSlot[]): PlacedItem[] {
  return slots.map((slot, index) => ({
    key: `${slot.group}-slot-${index}`,
    group: slot.group,
    order: slot.order,
    content: slot.content,
  }))
}

function groupItems(items: PlacedItem[]): PlacedGroup[] {
  const byGroup = new Map<string, PlacedItem[]>()
  for (const item of items) {
    const existing = byGroup.get(item.group)
    if (existing) existing.push(item)
    else byGroup.set(item.group, [item])
  }
  return [...byGroup.entries()]
    .map(([name, members]) => {
      const sorted = [...members].sort((a, b) => a.order - b.order)
      return { name, order: sorted[0].order, items: sorted }
    })
    .sort((a, b) => a.order - b.order)
}

function HighlightedEntry({ entry, description }: { entry: SettingsEntry; description: string }) {
  const highlighted = useHighlightedSetting(entry.id)
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted) anchor.current?.scrollIntoView({ block: 'center' })
  }, [highlighted])

  const content = entryRowContent(entry, description)
  if (content === null) return null

  return (
    <div
      ref={anchor}
      className={`-mx-2 rounded-field px-2 py-1.5 transition-colors duration-300 ${
        highlighted ? 'bg-fill-ghost ring-1 ring-line-strong' : ''
      }`}
    >
      {content}
    </div>
  )
}

function entryRowContent(entry: SettingsEntry, description: string): ReactNode {
  if (isSettingsValueEntry(entry)) return <ValueRow entry={entry} description={description} />
  if (entry.control.kind === 'action') return <ActionRow entry={entry} description={description} run={entry.control.run} actionLabel={entry.control.actionLabel} />
  return null
}

function ActionRow({
  entry,
  description,
  actionLabel,
  run,
}: {
  entry: SettingsEntry
  description: string
  actionLabel: string
  run: () => Promise<unknown>
}) {
  return (
    <Row label={entry.label} description={description}>
      <Button variant="outline" size="sm" onClick={() => { run().catch(() => {}) }}>
        {actionLabel}
      </Button>
    </Row>
  )
}

function ValueRow({ entry, description }: { entry: SettingsValueEntry; description: string }) {
  const { value, write } = useSettingsValue(entry)
  const control = entry.control

  if (control.kind === 'toggle') {
    return (
      <Row label={entry.label} description={description}>
        <Toggle label={entry.label} checked={value === true} onChange={write} />
      </Row>
    )
  }

  if (control.kind === 'slider') {
    return (
      <Row label={entry.label} description={description}>
        <Slider
          label={entry.label}
          min={control.min}
          max={control.max}
          step={control.step}
          value={typeof value === 'number' ? value : control.min}
          suffix={control.unit}
          onChange={write}
        />
      </Row>
    )
  }

  if (control.kind === 'select') {
    return (
      <Row label={entry.label} description={description}>
        <Select
          label={entry.label}
          options={[...control.options]}
          value={typeof value === 'string' ? value : String(entry.defaultValue)}
          onChange={write}
        />
      </Row>
    )
  }

  if (control.kind === 'segmented') {
    return (
      <Row label={entry.label} description={description}>
        <Segmented
          label={entry.label}
          options={[...control.options]}
          value={typeof value === 'string' || typeof value === 'number' ? value : (entry.defaultValue as string | number)}
          onChange={write}
        />
      </Row>
    )
  }

  if (control.kind === 'hotkey') {
    return (
      <Row label={entry.label} description={description}>
        <HotkeyRecorder
          value={typeof value === 'string' ? value : control.fallback}
          fallback={control.fallback}
          onChange={write}
        />
      </Row>
    )
  }

  return null
}

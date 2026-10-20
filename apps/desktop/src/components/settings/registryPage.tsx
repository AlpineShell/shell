import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { Card, PageTitle, Section } from '@alpine/ui'
import { SETTINGS_PAGE_GROUP, SETTINGS_REGISTRY, settingsPage } from '../../settings/registry'
import { useHighlightedSetting } from '../../hooks/useHighlightedSetting'
import { entryRowContent } from './registryRowContent'

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
      <PageTitle variant="plain" title={definition?.label ?? ''} />
      {lead}
      {groups.map((group) => (
        <Section key={group.name} variant="label" title={group.name} subtitle={groupSubtitles[group.name]}>
          <Card variant="group">
            {group.items.map((item) => (
              <Fragment key={item.key}>{item.content}</Fragment>
            ))}
          </Card>
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
      className={`flex flex-col justify-center transition-colors duration-300 ${
        highlighted ? 'bg-fill-ghost ring-1 ring-inset ring-line-strong' : ''
      }`}
    >
      {content}
    </div>
  )
}

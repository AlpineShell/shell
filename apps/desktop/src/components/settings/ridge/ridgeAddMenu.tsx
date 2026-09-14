import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Card, SearchPicker, type SearchPickerOption } from '@alpine/ui'
import { scoreField } from '../../../lib/launcherSearch'
import { settingsEntry } from '../../../settings/registry'
import { ridgeItemPluginIcon, ridgeItemSearchEntryId, ridgeItemTitle } from './ridgeItemCatalogue'

const ADD_MENU_LABEL = 'Add to Ridge'

const NOTHING_HIDDEN = 'Everything is already on Ridge.'

const OPTION_ICON_SIZE = 14

function hiddenItemIcon(id: TopbarItemId, data: RidgePreviewData): ReactNode {
  const pluginIcon = ridgeItemPluginIcon(id, data)
  if (pluginIcon) return <img src={pluginIcon} alt="" className="size-3.5 rounded-sm object-contain" />
  const Icon = settingsEntry(ridgeItemSearchEntryId(id))?.icon
  return Icon ? <Icon size={OPTION_ICON_SIZE} /> : null
}

function hiddenItemOption(id: TopbarItemId, data: RidgePreviewData): SearchPickerOption {
  return { value: id, label: ridgeItemTitle(id, data), icon: hiddenItemIcon(id, data) }
}

export default function RidgeAddMenu({ id, items, previewData, onSelect, onDismiss }: RidgeAddMenuProps) {
  function dismissOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onDismiss()
  }

  function selectHiddenItem(value: string) {
    const chosen = items.find((hiddenId) => hiddenId === value)
    if (chosen) onSelect(chosen)
  }

  return (
    <div id={id} role="group" aria-label={ADD_MENU_LABEL} onKeyDown={dismissOnEscape} className="w-full max-w-[22rem]">
      <Card className="flex flex-col gap-2 p-3">
        {items.length > 0 ? (
          <SearchPicker
            label={ADD_MENU_LABEL}
            placeholder="Find a hidden item"
            options={items.map((item) => hiddenItemOption(item, previewData))}
            emptyMessage="No hidden item matches that."
            score={scoreField}
            onSelect={selectHiddenItem}
            onDismiss={onDismiss}
          />
        ) : (
          <NothingHidden />
        )}
      </Card>
    </div>
  )
}

function NothingHidden() {
  const message = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    message.current?.focus()
  }, [])

  return (
    <p ref={message} tabIndex={-1} className="px-1 py-3 text-center text-xs text-ink-quiet outline-none">
      {NOTHING_HIDDEN}
    </p>
  )
}

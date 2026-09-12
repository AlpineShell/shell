import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Puzzle } from 'lucide-react'
import { settingsPageRoute } from '../../../settings/registry'
import Button from '../../ui/button'
import Card from '../../ui/card'
import SearchPicker from '../../ui/searchPicker'
import { ridgeItemTitle } from './ridgeItemCatalogue'

const ADD_MENU_LABEL = 'Add to Ridge'

const NOTHING_HIDDEN = 'Everything is already on Ridge.'

function hiddenItemOption(id: TopbarItemId): SearchPickerOption {
  return { value: id, label: ridgeItemTitle(id) }
}

export default function RidgeAddMenu({ items, onSelect, onDismiss, onNavigate }: RidgeAddMenuProps) {
  const pluginsRoute = settingsPageRoute('plugins')

  function dismissOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onDismiss()
  }

  function selectHiddenItem(value: string) {
    const chosen = items.find((id) => id === value)
    if (chosen) onSelect(chosen)
  }

  return (
    <div role="group" aria-label={ADD_MENU_LABEL} onKeyDown={dismissOnEscape} className="w-full max-w-[22rem]">
      <Card className="flex flex-col gap-2 p-3">
        {items.length > 0 ? (
          <SearchPicker
            label={ADD_MENU_LABEL}
            placeholder="Find a hidden item"
            options={items.map(hiddenItemOption)}
            emptyMessage="No hidden item matches that."
            onSelect={selectHiddenItem}
            onDismiss={onDismiss}
          />
        ) : (
          <NothingHidden />
        )}
        {pluginsRoute !== null && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Puzzle size={14} />}
            onClick={() => onNavigate(pluginsRoute)}
            className="self-start"
          >
            Get plugins
          </Button>
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

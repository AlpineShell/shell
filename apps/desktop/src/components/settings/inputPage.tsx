import { useState } from 'react'
import { AlertTriangle, ArrowLeftRight, ChevronDown, ChevronUp, Keyboard, Languages, Plus, Trash2 } from 'lucide-react'
import { useKeyboardLayout } from '../../hooks/useKeyboardLayout'
import RegistryPage from './registryPage'
import Badge from '../ui/badge'
import Button from '../ui/button'
import Card from '../ui/card'
import EmptyState from '../ui/emptyState'
import IconButton from '../ui/iconButton'
import Row from '../ui/row'
import SearchPicker from '../ui/searchPicker'
import Select from '../ui/select'

const LAYOUTS_GROUP = 'Languages and layouts'
const INPUT_METHOD_GROUP = 'Input method'

const FIRST_IN_LIST = ''

export default function InputPage() {
  const {
    languages,
    defaultInputMethod,
    availableLayouts,
    addLayout,
    removeLayout,
    reorderLayouts,
    setDefaultInputMethod,
    activateNow,
  } = useKeyboardLayout()

  const slots: SettingsPageSlot[] = [
    {
      group: LAYOUTS_GROUP,
      order: 1,
      replaces: ['keyboard-layouts', 'keyboard-layout-remove', 'switch-input-method'],
      content: (
        <LanguageList
          languages={languages}
          availableLayouts={availableLayouts}
          defaultInputMethod={defaultInputMethod}
          onAdd={addLayout}
          onRemove={removeLayout}
          onReorder={reorderLayouts}
          onActivate={activateNow}
        />
      ),
    },
    {
      group: INPUT_METHOD_GROUP,
      order: 4,
      replaces: ['default-input-method'],
      content: (
        <DefaultInputMethodRow
          languages={languages}
          value={defaultInputMethod}
          onChange={setDefaultInputMethod}
        />
      ),
    },
  ]

  return (
    <RegistryPage
      page="input"
      slots={slots}
      lead={
        <p className="text-sm text-ink-quiet">
          Listing, adding, removing and reordering layouts, and choosing the default input method, are per-user
          Windows settings. They change your account only, take effect at once, and never ask for administrator
          rights.
        </p>
      }
      groupSubtitles={{
        [LAYOUTS_GROUP]: 'Your languages and the layouts attached to each, in the order Windows cycles them.',
        [INPUT_METHOD_GROUP]: 'The layout Windows starts you in, whichever language comes first.',
      }}
    />
  )
}

function removalWarning(
  language: KeyboardLanguage,
  layout: KeyboardInputMethod,
  defaultInputMethod: string | null
): string | null {
  if (language.layouts.length === 1) {
    return `${layout.name} is the only layout ${language.autonym} has. Removing it leaves that language with nothing to type in.`
  }
  if (layout.tip === defaultInputMethod) {
    return `${layout.name} is your default input method. Removing it hands the default back to the first layout in the list.`
  }
  return null
}

function LanguageList({
  languages,
  availableLayouts,
  defaultInputMethod,
  onAdd,
  onRemove,
  onReorder,
  onActivate,
}: {
  languages: KeyboardLanguage[]
  availableLayouts: KeyboardLayoutOption[]
  defaultInputMethod: string | null
  onAdd: (tag: string, layoutId: string) => void
  onRemove: (tag: string, tip: string) => void
  onReorder: (tag: string, tips: string[]) => void
  onActivate: (tip: string) => void
}) {
  if (languages.length === 0) {
    return (
      <EmptyState
        icon={<Languages size={20} />}
        title="No language list yet."
        detail="Windows has not reported your languages yet. Reopen Settings to ask again."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {languages.map((language) => (
        <LanguageCard
          key={language.tag}
          language={language}
          availableLayouts={availableLayouts}
          defaultInputMethod={defaultInputMethod}
          onAdd={onAdd}
          onRemove={onRemove}
          onReorder={onReorder}
          onActivate={onActivate}
        />
      ))}
      <p className="text-xs text-ink-quiet">
        Switching a layout applies to the window in front, which is this one while Settings has focus. Windows can
        refuse the request, so treat it as best effort. It does not change what any other window types in.
      </p>
    </div>
  )
}

function LanguageCard({
  language,
  availableLayouts,
  defaultInputMethod,
  onAdd,
  onRemove,
  onReorder,
  onActivate,
}: {
  language: KeyboardLanguage
  availableLayouts: KeyboardLayoutOption[]
  defaultInputMethod: string | null
  onAdd: (tag: string, layoutId: string) => void
  onRemove: (tag: string, tip: string) => void
  onReorder: (tag: string, tips: string[]) => void
  onActivate: (tip: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const attached = new Set(language.layouts.map((layout) => layout.layoutId))
  const options = availableLayouts
    .filter((layout) => !attached.has(layout.id))
    .map((layout) => ({ value: layout.id, label: layout.name }))

  function move(index: number, delta: number) {
    const tips = language.layouts.map((layout) => layout.tip)
    const target = index + delta
    if (target < 0 || target >= tips.length) return
    const next = [...tips]
    next[index] = tips[target]
    next[target] = tips[index]
    onReorder(language.tag, next)
  }

  function requestRemove(layout: KeyboardInputMethod) {
    if (removalWarning(language, layout, defaultInputMethod)) setConfirming(layout.tip)
    else onRemove(language.tag, layout.tip)
  }

  function confirmRemove(layout: KeyboardInputMethod) {
    setConfirming(null)
    onRemove(language.tag, layout.tip)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line-hairline px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-dense text-ink-primary">{language.autonym}</div>
          <div className="truncate text-xs text-ink-quiet">
            {language.name} · {language.tag}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setPicking(true)}
          disabled={picking || options.length === 0}
        >
          Add layout
        </Button>
      </div>

      {picking && (
        <div className="border-b border-line-hairline p-3">
          <SearchPicker
            label={`Add a keyboard layout to ${language.autonym}`}
            placeholder={`Search ${options.length} installed layouts`}
            options={options}
            emptyMessage="No installed layout matches that."
            onSelect={(layoutId) => {
              setPicking(false)
              onAdd(language.tag, layoutId)
            }}
            onDismiss={() => setPicking(false)}
          />
        </div>
      )}

      {language.layouts.length === 0 ? (
        <p className="px-3 py-3 text-xs text-ink-quiet">
          This language has no layout. Add one to type in {language.autonym}.
        </p>
      ) : (
        <ul>
          {language.layouts.map((layout, index) => (
            <li key={layout.tip} className="border-b border-line-hairline last:border-b-0">
              <div className="flex items-center gap-1.5 px-3 py-2">
                <Keyboard size={15} className="mr-1 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-dense text-ink-primary">{layout.name}</span>
                {layout.tip === defaultInputMethod && <Badge tone="success">Default</Badge>}
                <IconButton
                  label={`Move ${layout.name} up`}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                >
                  <ChevronUp size={15} />
                </IconButton>
                <IconButton
                  label={`Move ${layout.name} down`}
                  onClick={() => move(index, 1)}
                  disabled={index === language.layouts.length - 1}
                >
                  <ChevronDown size={15} />
                </IconButton>
                <IconButton
                  label={`Type with ${layout.name} in the window in front`}
                  onClick={() => onActivate(layout.tip)}
                >
                  <ArrowLeftRight size={15} />
                </IconButton>
                <IconButton
                  label={`Remove ${layout.name}`}
                  variant="danger"
                  onClick={() => requestRemove(layout)}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>

              {confirming === layout.tip && (
                <div className="flex items-center gap-2 border-t border-line-hairline bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    {removalWarning(language, layout, defaultInputMethod)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Keep it
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => confirmRemove(layout)}>
                    Remove anyway
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function DefaultInputMethodRow({
  languages,
  value,
  onChange,
}: {
  languages: KeyboardLanguage[]
  value: string | null
  onChange: (tip: string | null) => void
}) {
  const options = [
    { value: FIRST_IN_LIST, label: 'First in the list' },
    ...languages.flatMap((language) =>
      language.layouts.map((layout) => ({ value: layout.tip, label: `${layout.name} — ${language.autonym}` }))
    ),
  ]
  const selected = options.some((option) => option.value === value) ? (value as string) : FIRST_IN_LIST

  return (
    <Row
      label="Default input method"
      description="Windows types with this layout in new windows, whichever language is first in your list."
    >
      <Select
        label="Default input method"
        options={options}
        value={selected}
        onChange={(next) => onChange(next === FIRST_IN_LIST ? null : next)}
      />
    </Row>
  )
}

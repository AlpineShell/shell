import { useCallback, useRef, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronUp, Keyboard, Plus, Trash2 } from 'lucide-react'
import { Badge, Card, ConfirmButton, EmptyState, IconButton, Row, SearchPicker, Select } from '@alpine/ui'
import { useKeyboardLayout } from '../../hooks/useKeyboardLayout'
import { useOutsidePointer } from '../../hooks/useOutsidePointer'
import { scoreField } from '../../lib/launcherSearch'
import RegistryPage from './registryPage'

const LAYOUTS_GROUP = 'Languages and layouts'
const INPUT_METHOD_GROUP = 'Input method'

const FIRST_IN_LIST = ''

export default function InputPage() {
  const {
    languages,
    defaultInputMethod,
    availableLayouts,
    availableLanguages,
    languageError,
    addingLanguage,
    addLanguage,
    removeLanguage,
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
      replaces: ['keyboard-layouts', 'keyboard-layout-remove', 'switch-input-method', 'language-add', 'language-remove'],
      content: (
        <LanguageList
          languages={languages}
          availableLanguages={availableLanguages}
          availableLayouts={availableLayouts}
          defaultInputMethod={defaultInputMethod}
          languageError={languageError}
          addingLanguage={addingLanguage}
          onAddLanguage={addLanguage}
          onRemoveLanguage={removeLanguage}
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

  return <RegistryPage page="input" slots={slots} />
}

function languageOptionLabel(option: KeyboardLanguageOption): string {
  return option.nativeName === option.name ? option.name : `${option.name} — ${option.nativeName}`
}

function languageCountLabel(count: number): string {
  return count === 1 ? '1 language' : `${count} languages`
}

function LanguageList({
  languages,
  availableLanguages,
  availableLayouts,
  defaultInputMethod,
  languageError,
  addingLanguage,
  onAddLanguage,
  onRemoveLanguage,
  onAdd,
  onRemove,
  onReorder,
  onActivate,
}: {
  languages: KeyboardLanguage[]
  availableLanguages: KeyboardLanguageOption[]
  availableLayouts: KeyboardLayoutOption[]
  defaultInputMethod: string | null
  languageError: string | null
  addingLanguage: boolean
  onAddLanguage: (tag: string) => void
  onRemoveLanguage: (tag: string) => void
  onAdd: (tag: string, layoutId: string) => void
  onRemove: (tag: string, tip: string) => void
  onReorder: (tag: string, tips: string[]) => void
  onActivate: (tip: string) => void
}) {
  if (languages.length === 0) {
    return (
      <EmptyState variant="plain" title="Windows has not reported your languages yet." />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <AddLanguageBar
        languages={languages}
        availableLanguages={availableLanguages}
        adding={addingLanguage}
        onAdd={onAddLanguage}
      />
      {languageError && (
        <p role="alert" className="text-xs text-danger">
          {languageError}
        </p>
      )}
      {languages.map((language) => (
        <LanguageCard
          key={language.tag}
          language={language}
          availableLayouts={availableLayouts}
          defaultInputMethod={defaultInputMethod}
          canRemoveLanguage={languages.length > 1}
          onRemoveLanguage={onRemoveLanguage}
          onAdd={onAdd}
          onRemove={onRemove}
          onReorder={onReorder}
          onActivate={onActivate}
        />
      ))}
    </div>
  )
}

function AddLanguageBar({
  languages,
  availableLanguages,
  adding,
  onAdd,
}: {
  languages: KeyboardLanguage[]
  availableLanguages: KeyboardLanguageOption[]
  adding: boolean
  onAdd: (tag: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const pickerAnchor = useRef<HTMLDivElement>(null)
  const closePicker = useCallback(() => setPicking(false), [])

  useOutsidePointer(pickerAnchor, picking, closePicker)

  const inList = new Set(languages.map((language) => language.tag.toLowerCase()))
  const options = availableLanguages
    .filter((option) => !inList.has(option.tag.toLowerCase()))
    .map((option) => ({ value: option.tag, label: languageOptionLabel(option), detail: option.tag }))

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-quiet">
        {adding ? 'Adding the language…' : languageCountLabel(languages.length)}
      </span>
      <div ref={pickerAnchor} className="relative flex">
        <IconButton
          label="Add language"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          disabled={adding || options.length === 0}
        >
          <Plus size={15} />
        </IconButton>
        {picking && (
          <div className="absolute top-full right-0 z-40 mt-2 w-88">
            <Card className="p-3">
              <SearchPicker
                label="Add a language"
                placeholder={`Search ${options.length} languages`}
                options={options}
                emptyMessage="No language matches that."
                score={scoreField}
                onSelect={(tag) => {
                  setPicking(false)
                  onAdd(tag)
                }}
                onDismiss={closePicker}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function LanguageCard({
  language,
  availableLayouts,
  defaultInputMethod,
  canRemoveLanguage,
  onRemoveLanguage,
  onAdd,
  onRemove,
  onReorder,
  onActivate,
}: {
  language: KeyboardLanguage
  availableLayouts: KeyboardLayoutOption[]
  defaultInputMethod: string | null
  canRemoveLanguage: boolean
  onRemoveLanguage: (tag: string) => void
  onAdd: (tag: string, layoutId: string) => void
  onRemove: (tag: string, tip: string) => void
  onReorder: (tag: string, tips: string[]) => void
  onActivate: (tip: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const pickerAnchor = useRef<HTMLDivElement>(null)
  const closePicker = useCallback(() => setPicking(false), [])

  useOutsidePointer(pickerAnchor, picking, closePicker)

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

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line-hairline px-3 py-2.5">
        <div className="min-w-0 truncate text-dense text-ink-primary">{language.autonym}</div>
        <div className="flex items-center gap-1.5">
          <div ref={pickerAnchor} className="relative flex">
            <IconButton
              label="Add layout"
              aria-expanded={picking}
              onClick={() => setPicking((open) => !open)}
              disabled={options.length === 0}
            >
              <Plus size={15} />
            </IconButton>
            {picking && (
              <div className="absolute top-full right-0 z-40 mt-2 w-88">
                <Card className="p-3">
                  <SearchPicker
                    label={`Add a keyboard layout to ${language.autonym}`}
                    placeholder={`Search ${options.length} installed layouts`}
                    options={options}
                    emptyMessage="No installed layout matches that."
                    score={scoreField}
                    onSelect={(layoutId) => {
                      setPicking(false)
                      onAdd(language.tag, layoutId)
                    }}
                    onDismiss={closePicker}
                  />
                </Card>
              </div>
            )}
          </div>
          {canRemoveLanguage && (
            <ConfirmButton
              label="Remove language"
              confirmLabel="Remove language"
              icon={<Trash2 size={15} />}
              iconOnly
              confirmOnly
              onConfirm={() => onRemoveLanguage(language.tag)}
            />
          )}
        </div>
      </div>

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
                <ConfirmButton
                  label={`Remove ${layout.name}`}
                  confirmLabel="Remove layout"
                  icon={<Trash2 size={15} />}
                  iconOnly
                  confirmOnly
                  onConfirm={() => onRemove(language.tag, layout.tip)}
                />
              </div>
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
      info="Windows types with this layout in new windows, whichever language is first in your list."
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

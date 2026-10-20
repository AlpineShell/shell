import { useCallback, useRef, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronUp, Keyboard, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, ConfirmButton, EmptyState, IconButton, Row, SearchPicker, Select } from '@alpine/ui'
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

const REVEALED_CONTROLS = 'opacity-0 transition-opacity group-hover/layout:opacity-100 group-focus-within/layout:opacity-100'

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
    return <EmptyState variant="plain" title="Windows has not reported your languages yet." />
  }

  return (
    <>
      {languages.map((language) => (
        <LanguageBlock
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
      <AddLanguageRow
        languages={languages}
        availableLanguages={availableLanguages}
        adding={addingLanguage}
        error={languageError}
        onAdd={onAddLanguage}
      />
    </>
  )
}

function AddLanguageRow({
  languages,
  availableLanguages,
  adding,
  error,
  onAdd,
}: {
  languages: KeyboardLanguage[]
  availableLanguages: KeyboardLanguageOption[]
  adding: boolean
  error: string | null
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
    <div className="flex items-center gap-3">
      <div ref={pickerAnchor} className="relative flex">
        <Button
          shape="square"
          variant="ghost"
          size="sm"
          icon={<Plus size={14} />}
          aria-expanded={picking}
          busy={adding}
          disabled={options.length === 0}
          onClick={() => setPicking((open) => !open)}
          className="-ml-2"
        >
          {adding ? 'Adding the language…' : 'Add a language'}
        </Button>
        {picking && (
          <div className="absolute top-full left-0 z-40 mt-2 w-88">
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
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function LanguageBlock({
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
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-sm text-ink-primary">{language.autonym}</div>
        <div className="flex items-center gap-1.5">
          <div ref={pickerAnchor} className="relative flex">
            <Button
              shape="square"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              aria-expanded={picking}
              aria-label={`Add a layout to ${language.autonym}`}
              disabled={options.length === 0}
              onClick={() => setPicking((open) => !open)}
            >
              Add layout
            </Button>
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
              shape="square"
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
        <p className="pt-1 text-xs text-ink-quiet">No layout yet; add one to type in {language.autonym}.</p>
      ) : (
        <ul className="mt-1.5">
          {language.layouts.map((layout, index) => (
            <li
              key={layout.tip}
              className="group/layout flex h-10 items-center gap-1.5 border-t border-line-hairline pl-6"
            >
              <Keyboard size={15} className="mr-1.5 shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1 truncate text-dense text-ink-primary">{layout.name}</span>
              {layout.tip === defaultInputMethod && <Badge>Default</Badge>}
              <div className={`flex items-center gap-0.5 ${REVEALED_CONTROLS}`}>
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
                  shape="square"
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
    </div>
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
      description="The layout new windows start with, whichever language is first."
    >
      <Select
        variant="filled"
        label="Default input method"
        options={options}
        value={selected}
        onChange={(next) => onChange(next === FIRST_IN_LIST ? null : next)}
      />
    </Row>
  )
}

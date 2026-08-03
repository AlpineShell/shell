import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Keyboard, Plus, Trash2, X } from 'lucide-react'
import { SearchBox } from './appsShared'
import { useLanguage } from '../../hooks/useLanguage'

const SWITCH_HOTKEY_LABELS: Record<LayoutSwitchHotkey, string> = {
  default: 'Windows default',
  'alt-shift': 'Left Alt + Shift',
  'ctrl-shift': 'Ctrl + Shift',
  grave: 'Grave accent key',
  none: 'Not assigned',
}

function inputMethodLabel(language: PreferredLanguage, method: InputMethod): string {
  return `${language.autonym} - ${method.name}`
}

function moveTag(tags: string[], from: number, to: number): string[] {
  if (to < 0 || to >= tags.length) return tags
  const next = tags.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export default function LanguagePage() {
  const {
    state,
    catalog,
    active,
    busy,
    setLanguages,
    setInputMethods,
    setDefaultInput,
    setDisplayLanguage,
    setRegionalFormat,
    setHomeLocation,
    activateInput,
  } = useLanguage()
  const [addingLanguage, setAddingLanguage] = useState(false)
  const [addingKeyboardFor, setAddingKeyboardFor] = useState<string | null>(null)
  const [switchFailed, setSwitchFailed] = useState(false)

  const allMethods = useMemo(
    () => (state?.languages ?? []).flatMap((language) => language.inputMethods.map((method) => ({ language, method }))),
    [state]
  )

  const regions = useMemo(
    () => (catalog?.regions ?? []).slice().sort((a, b) => a.englishName.localeCompare(b.englishName)),
    [catalog]
  )

  if (!state) return <p className="text-sm text-white/50">Reading your Windows language settings…</p>

  if (state.availability !== 'ready') {
    return (
      <div className="flex flex-col gap-8 w-full">
        <h1 className="text-2xl font-semibold tracking-tight">Language &amp; Keyboard</h1>
        <p className="text-sm text-white/50">
          {state.availability === 'module-missing'
            ? "Windows' language management components aren't available on this PC, so these settings can't be changed from here."
            : 'Windows could not report your language settings. Try reopening Settings.'}
        </p>
      </div>
    )
  }

  const tags = state.languages.map((language) => language.tag)
  const onlyOneMethod = allMethods.length <= 1

  async function switchTo(tip: string) {
    const ok = await activateInput(tip)
    setSwitchFailed(!ok)
  }

  function addKeyboard(language: PreferredLanguage, klid: string) {
    const tip = `${language.langId.toUpperCase()}:${klid.toUpperCase()}`
    setAddingKeyboardFor(null)
    if (language.inputMethods.some((method) => method.tip.toLowerCase() === tip.toLowerCase())) return
    setInputMethods(language.tag, [...language.inputMethods.map((method) => method.tip), tip])
  }

  function removeKeyboard(language: PreferredLanguage, tip: string) {
    setInputMethods(language.tag, language.inputMethods.filter((method) => method.tip !== tip).map((method) => method.tip))
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Language &amp; Keyboard</h1>

      {state.pendingSignOut && (
        <div className="flex items-center justify-between gap-4 rounded-lg bg-neutral-900 border border-white/5 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13px] text-white/90">Sign out to finish applying your changes</div>
            <div className="text-xs text-white/50 mt-0.5">
              Alpine Shell keeps its current language until the shell restarts.
            </div>
          </div>
          <button
            onClick={() => window.shell.system.powerAction('logout')}
            className="shrink-0 h-8 px-3 rounded-md bg-white hover:bg-neutral-200 text-neutral-950 text-[12px] font-medium transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}

      <Section title="Typing" subtitle="Switch the keyboard the app you were last using types with.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {allMethods.map(({ language, method }) => {
              const current = active?.tip === method.tip
              const isIme = method.kind === 'ime'
              return (
                <button
                  key={method.tip}
                  onClick={() => !isIme && switchTo(method.tip)}
                  disabled={isIme || busy}
                  title={isIme ? 'Windows IME — switch with Win + Space' : undefined}
                  dir="auto"
                  className={`h-8 px-3 inline-flex items-center rounded-md border border-white/5 text-xs transition-colors ${
                    isIme ? 'text-white/35 cursor-not-allowed' : 'cursor-pointer'
                  } ${current ? 'bg-white/10 text-white' : isIme ? '' : 'text-white/60 hover:bg-white/5'}`}
                >
                  {inputMethodLabel(language, method)}
                </button>
              )
            })}
          </div>
          {allMethods.length === 0 && <p className="text-xs text-white/50">No keyboards are set up yet.</p>}
          {switchFailed && (
            <p className="text-xs text-red-300">
              Windows would not switch that app&apos;s keyboard. Apps running as administrator can only be switched from inside the app.
            </p>
          )}
        </div>
      </Section>

      <Section
        title="Preferred languages"
        subtitle="Windows uses the first language in this list that an app or website supports."
      >
        <div className="flex flex-col gap-2">
          {state.languages.map((language, index) => (
            <div key={language.tag} className="rounded-lg bg-neutral-900 border border-white/5 px-4 py-3 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-white/90 truncate" dir="auto">
                    {language.autonym}
                    {index === 0 && <span className="ml-2 text-[10px] uppercase tracking-wide text-white/40">Primary</span>}
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">
                    {language.englishName ? `${language.englishName} · ${language.tag}` : language.tag}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton
                    label="Move up"
                    disabled={index === 0 || busy}
                    onClick={() => setLanguages(moveTag(tags, index, index - 1))}
                  >
                    <ChevronUp size={14} />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={index === state.languages.length - 1 || busy}
                    onClick={() => setLanguages(moveTag(tags, index, index + 1))}
                  >
                    <ChevronDown size={14} />
                  </IconButton>
                  <IconButton
                    label="Remove language"
                    disabled={state.languages.length === 1 || busy}
                    onClick={() => setLanguages(tags.filter((tag) => tag !== language.tag))}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {language.inputMethods.map((method) => (
                  <span
                    key={method.tip}
                    className="h-7 pl-2.5 pr-1 inline-flex items-center gap-1 rounded-md bg-white/5 text-xs text-white/70"
                  >
                    <Keyboard size={12} className="text-white/40" />
                    <span dir="auto">{method.name}</span>
                    <button
                      onClick={() => removeKeyboard(language, method.tip)}
                      disabled={onlyOneMethod || busy}
                      aria-label={`Remove ${method.name}`}
                      className={`w-5 h-5 inline-flex items-center justify-center rounded transition-colors ${
                        onlyOneMethod || busy ? 'text-white/20 cursor-not-allowed' : 'text-white/40 hover:text-white hover:bg-white/10 cursor-pointer'
                      }`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {language.inputMethods.length === 0 && <span className="text-xs text-white/40">No keyboard</span>}
                <button
                  onClick={() => setAddingKeyboardFor(addingKeyboardFor === language.tag ? null : language.tag)}
                  disabled={!language.langId || busy}
                  className={`h-7 px-2 inline-flex items-center gap-1 rounded-md border border-white/10 text-xs transition-colors ${
                    !language.langId || busy ? 'text-white/25 cursor-not-allowed' : 'text-white/70 hover:bg-white/10 cursor-pointer'
                  }`}
                >
                  <Plus size={12} />
                  Add keyboard
                </button>
              </div>

              {addingKeyboardFor === language.tag && (
                <Picker
                  placeholder="Search keyboards"
                  items={(catalog?.layouts ?? []).map((layout) => ({ id: layout.klid, label: layout.name }))}
                  onPick={(klid) => addKeyboard(language, klid)}
                  onCancel={() => setAddingKeyboardFor(null)}
                />
              )}
            </div>
          ))}

          <button
            onClick={() => setAddingLanguage(!addingLanguage)}
            disabled={busy}
            className="h-9 px-3 inline-flex items-center gap-1.5 self-start rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            Add a language
          </button>

          {addingLanguage && (
            <Picker
              placeholder="Search languages"
              items={(catalog?.languages ?? [])
                .filter((candidate) => !tags.some((tag) => tag.toLowerCase() === candidate.tag.toLowerCase()))
                .map((candidate) => ({ id: candidate.tag, label: `${candidate.autonym} — ${candidate.englishName}` }))}
              onPick={(tag) => {
                setAddingLanguage(false)
                setLanguages([...tags, tag])
              }}
              onCancel={() => setAddingLanguage(false)}
            />
          )}
        </div>
      </Section>

      <Section title="Default input method" subtitle="The keyboard apps start with.">
        <SelectRow
          label="Default keyboard"
          value={state.defaultInputMethod ?? ''}
          disabled={busy || allMethods.length === 0}
          onChange={setDefaultInput}
          options={allMethods.map(({ language, method }) => ({ value: method.tip, label: inputMethodLabel(language, method) }))}
        />
      </Section>

      <Section
        title="Display language"
        subtitle="The language Windows uses for its own menus. Only languages with a Windows language pack installed can be picked."
      >
        <SelectRow
          label="Windows display language"
          value={state.displayLanguageOverride ?? ''}
          disabled={busy}
          onChange={(value) => setDisplayLanguage(value || null)}
          options={[
            { value: '', label: `Follow my language list (${state.effectiveDisplayLanguage || 'automatic'})` },
            ...state.installedDisplayLanguages.map((tag) => ({ value: tag, label: tag })),
          ]}
        />
        <p className="text-xs text-white/50 mt-3">Takes effect after you sign out and back in.</p>
      </Section>

      <Section title="Regional format" subtitle="How dates, times, numbers and currency are written.">
        <SelectRow
          label="Regional format"
          value={state.regionalFormat.tag}
          disabled={busy || !catalog}
          onChange={setRegionalFormat}
          options={(catalog?.languages ?? []).map((candidate) => ({
            value: candidate.tag,
            label: `${candidate.englishName} — ${candidate.autonym}`,
          }))}
        />
        <p className="text-xs text-white/50 mt-3">Apps pick this up the next time you start them.</p>
      </Section>

      <Section title="Country or region" subtitle="Used by Windows and apps to give you local content.">
        <SelectRow
          label="Country or region"
          value={String(state.homeLocation.geoId)}
          disabled={busy || !catalog}
          onChange={(value) => setHomeLocation(Number(value))}
          options={regions.map((region) => ({ value: String(region.geoId), label: region.englishName }))}
        />
        <p className="text-xs text-white/50 mt-3">Applies immediately.</p>
      </Section>

      <Section title="Advanced">
        <div className="flex flex-col gap-3">
          <ReadOnlyRow
            label="Language for non-Unicode programs"
            value={state.systemLocale.englishName || state.systemLocale.tag || 'Unknown'}
            description="Changing this needs an administrator and a full restart, so Windows manages it."
          />
          <ReadOnlyRow
            label="Input switch shortcut"
            value={SWITCH_HOTKEY_LABELS[state.switchHotkey.language]}
            description="Win + Space always switches your keyboard, whatever this is set to."
          />
        </div>
      </Section>
    </div>
  )
}

function Picker({
  placeholder,
  items,
  onPick,
  onCancel,
}: {
  placeholder: string
  items: { id: string; label: string }[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matches = items.filter((item) => !needle || item.label.toLowerCase().includes(needle)).slice(0, 60)

  return (
    <div className="rounded-lg bg-neutral-950 border border-white/10 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder={placeholder} />
        <button
          onClick={onCancel}
          className="h-8 px-3 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 text-xs font-medium transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <div className="max-h-56 overflow-auto flex flex-col">
        {matches.length === 0 ? (
          <span className="text-xs text-white/40 px-1 py-2">Nothing matches that search.</span>
        ) : (
          matches.map((item) => (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              dir="auto"
              className="text-left text-[13px] text-white/80 hover:text-white hover:bg-white/5 rounded px-2 h-8 flex items-center cursor-pointer"
            >
              {item.label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-white/50 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function SelectRow({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const known = options.some((option) => option.value === value)
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 text-sm">{label}</div>
      <select
        value={known ? value : ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-900 border border-white/10 rounded text-sm px-2 h-8 max-w-[22rem] cursor-pointer disabled:cursor-not-allowed"
      >
        {!known && <option value="">{value || 'Not set'}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function ReadOnlyRow({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-white/50 mt-0.5">{description}</div>
      </div>
      <span className="shrink-0 text-xs text-white/60">{value}</span>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors ${
        disabled ? 'text-white/20 cursor-not-allowed' : 'text-white/60 hover:text-white hover:bg-white/10 cursor-pointer'
      }`}
    >
      {children}
    </button>
  )
}

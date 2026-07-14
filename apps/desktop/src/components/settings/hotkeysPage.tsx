import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'

const SPECIAL_KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Enter': 'Enter',
  'Tab': 'Tab',
  'Backspace': 'Backspace',
  'Delete': 'Delete',
  'Insert': 'Insert',
  'Home': 'Home',
  'End': 'End',
  'PageUp': 'PageUp',
  'PageDown': 'PageDown',
  ',': 'Comma',
  '.': 'Period',
}

function formatHotkey(hk: string): string {
  if (hk === 'Win') return 'Win'
  return hk
    .split('+')
    .map((p) => (p === 'Super' ? 'Win' : p === 'CommandOrControl' ? 'Ctrl' : p))
    .join(' + ')
}

function buildAccelerator(e: React.KeyboardEvent): string | null {
  const k = e.key
  if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') return null

  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')

  let keyName = SPECIAL_KEY_MAP[k] ?? k
  if (keyName.length === 1) keyName = keyName.toUpperCase()
  if (/^F\d+$/.test(keyName)) keyName = keyName.toUpperCase()

  if (mods.length === 0 && !/^F\d+$/.test(keyName)) return null

  return [...mods, keyName].join('+')
}

export default function HotkeysPage() {
  const [searchKey, setSearchKey] = useState('Win')
  const [recentApps, setRecentApps] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(true)
  const [showBrowserTabs, setShowBrowserTabs] = useState(true)
  const [maxResults, setMaxResults] = useState(8)

  useEffect(() => {
    window.launcher.getHotkey().then(setSearchKey)
    window.launcher.onHotkeyChanged(setSearchKey)
    window.launcher.recentApps().then(setRecentApps)
    window.launcher.showBookmarks().then(setShowBookmarks)
    window.launcher.showBrowserTabs().then(setShowBrowserTabs)
    window.launcher.maxResults().then(setMaxResults)
    const offRecentApps = window.launcher.onRecentAppsChanged(setRecentApps)
    const offShowBookmarks = window.launcher.onShowBookmarksChanged(setShowBookmarks)
    const offShowBrowserTabs = window.launcher.onShowBrowserTabsChanged(setShowBrowserTabs)
    const offMaxResults = window.launcher.onMaxResultsChanged(setMaxResults)
    return () => { offRecentApps(); offShowBookmarks(); offShowBrowserTabs(); offMaxResults() }
  }, [])

  async function setSearch(hk: string) {
    const result = await window.launcher.setHotkey(hk)
    setSearchKey(result)
  }

  function toggleRecentApps(value: boolean) {
    setRecentApps(value)
    window.launcher.setRecentApps(value)
  }

  function toggleShowBookmarks(value: boolean) {
    setShowBookmarks(value)
    window.launcher.setShowBookmarks(value)
  }

  function toggleShowBrowserTabs(value: boolean) {
    setShowBrowserTabs(value)
    window.launcher.setShowBrowserTabs(value)
  }

  function changeMaxResults(value: number) {
    setMaxResults(value)
    window.launcher.setMaxResults(value)
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Hotkeys</h1>

      <div className="flex flex-col">
        <HotkeyRow
          label="Search"
          description="Search apps, switch to open apps, calculate etc"
          value={searchKey}
          defaultValue="Win"
          onChange={setSearch}
        />
        <HotkeyRow
          label="Screenshot"
          description="Create a screenshot"
          value="Super+Shift+S"
          defaultValue="Super+Shift+S"
          onChange={() => {}}
          disabled
        />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Search results</h2>
        <ToggleRow
          label="Show recent apps"
          description="When you open Search, list your most-used apps before you type. Turn this off to start with an empty search."
          checked={recentApps}
          onChange={toggleRecentApps}
        />
        <ToggleRow
          label="Show browser bookmarks"
          description="Search your default browser's bookmarks and open them from Search. Works with Chromium browsers (Chrome, Edge, Brave and more)."
          checked={showBookmarks}
          onChange={toggleShowBookmarks}
        />
        <ToggleRow
          label="Show open browser tabs"
          description="Find the tabs you have open in Chrome, Edge, Firefox and other browsers, and switch straight to them from Search."
          checked={showBrowserTabs}
          onChange={toggleShowBrowserTabs}
        />
        <StepperRow
          label="Maximum results"
          description="The most apps and options Search will show at once, before and after you type."
          value={maxResults}
          min={3}
          max={8}
          onChange={changeMaxResults}
        />
      </section>
    </div>
  )
}

function HotkeyRow({
  label,
  description,
  value,
  defaultValue,
  onChange,
  disabled,
}: {
  label: string
  description: string
  value: string
  defaultValue: string
  onChange: (hk: string) => void
  disabled?: boolean
}) {
  const [recording, setRecording] = useState(false)
  const [draft, setDraft] = useState('')
  const recorderRef = useRef<HTMLButtonElement>(null)

  function startRecording() {
    if (disabled) return
    setDraft('')
    setRecording(true)
    requestAnimationFrame(() => recorderRef.current?.focus())
  }

  function stopRecording() {
    setRecording(false)
    setDraft('')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      stopRecording()
      return
    }
    const acc = buildAccelerator(e)
    if (acc) {
      setDraft(acc)
      onChange(acc)
      stopRecording()
    }
  }

  const showReset = !disabled && value !== defaultValue
  const display = recording ? (draft ? formatHotkey(draft) : 'Press keys…') : formatHotkey(value)

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-white/50 mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {showReset && (
          <button
            onClick={() => onChange(defaultValue)}
            className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            reset
          </button>
        )}
        <button
          ref={recorderRef}
          onClick={startRecording}
          onKeyDown={handleKey}
          onBlur={stopRecording}
          disabled={disabled}
          className={`min-w-15 h-8 px-3 rounded-md border text-[12px] font-medium outline-none transition-colors ${
            disabled
              ? 'border-white/5 bg-white/5 text-white/40 cursor-not-allowed'
              : recording
                ? 'border-white/30 bg-white/10 text-white cursor-text'
                : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/10 cursor-pointer'
          }`}
        >
          {display}
        </button>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-white/50 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative rounded-full transition-colors cursor-pointer ${checked ? 'bg-white' : 'bg-white/15'}`}
        style={{ width: 36, height: 20 }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-all"
          style={{
            width: 16,
            height: 16,
            left: checked ? 18 : 2,
            backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)',
          }}
        />
      </button>
    </div>
  )
}

function StepperRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  description?: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-white/50 mt-0.5">{description}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <StepperButton ariaLabel="Fewer results" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          <Minus size={14} />
        </StepperButton>
        <span className="w-6 text-center text-sm tabular-nums">{value}</span>
        <StepperButton ariaLabel="More results" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          <Plus size={14} />
        </StepperButton>
      </div>
    </div>
  )
}

function StepperButton({
  ariaLabel,
  onClick,
  disabled,
  children,
}: {
  ariaLabel: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`w-8 h-8 flex items-center justify-center rounded-md border transition-colors ${
        disabled
          ? 'border-white/5 bg-white/5 text-white/30 cursor-not-allowed'
          : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/10 cursor-pointer'
      }`}
    >
      {children}
    </button>
  )
}

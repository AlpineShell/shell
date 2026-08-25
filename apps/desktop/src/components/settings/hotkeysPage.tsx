import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import PageTitle from '../ui/pageTitle'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import IconButton from '../ui/iconButton'

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
      <PageTitle title="Hotkeys" />

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
        <h2 className="text-sm font-semibold text-ink-primary">Search results</h2>
        <Row
          label="Show recent apps"
          description="When you open Search, list your most-used apps before you type. Turn this off to start with an empty search."
        >
          <Toggle label="Show recent apps" checked={recentApps} onChange={toggleRecentApps} />
        </Row>
        <Row
          label="Show browser bookmarks"
          description="Search your default browser's bookmarks and open them from Search. Works with Chromium browsers (Chrome, Edge, Brave and more)."
        >
          <Toggle label="Show browser bookmarks" checked={showBookmarks} onChange={toggleShowBookmarks} />
        </Row>
        <Row
          label="Show open browser tabs"
          description="Find the tabs you have open in Chrome, Edge, Firefox and other browsers, and switch straight to them from Search."
        >
          <Toggle label="Show open browser tabs" checked={showBrowserTabs} onChange={toggleShowBrowserTabs} />
        </Row>
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
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line-hairline last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-primary">{label}</div>
        <div className="text-xs text-ink-quiet mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {showReset && (
          <button
            onClick={() => onChange(defaultValue)}
            className="focus-ring cursor-pointer text-xs text-ink-quiet underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink-primary"
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
          className={`focus-ring min-w-15 h-8 px-3 rounded-field border text-[12px] font-medium outline-none transition-colors ${
            disabled
              ? 'border-line-hairline bg-fill-subtle text-ink-faint cursor-not-allowed'
              : recording
                ? 'border-focus-ring bg-surface-3 text-ink-primary cursor-text'
                : 'border-line-hairline bg-surface-2 text-ink-primary hover:bg-fill-subtle cursor-pointer'
          }`}
        >
          {display}
        </button>
      </div>
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
    <Row label={label} description={description}>
      <div className="flex items-center gap-1.5">
        <IconButton label="Fewer results" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          <Minus size={14} />
        </IconButton>
        <span className="w-6 text-center text-sm tabular-nums text-ink-primary">{value}</span>
        <IconButton label="More results" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          <Plus size={14} />
        </IconButton>
      </div>
    </Row>
  )
}

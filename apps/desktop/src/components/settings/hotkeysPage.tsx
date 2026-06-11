import { useEffect, useRef, useState } from 'react'

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

  useEffect(() => {
    window.launcher.getHotkey().then(setSearchKey)
    window.launcher.onHotkeyChanged(setSearchKey)
  }, [])

  async function setSearch(hk: string) {
    const result = await window.launcher.setHotkey(hk)
    setSearchKey(result)
  }

  return (
    <div className="flex flex-col gap-6 w-full">
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

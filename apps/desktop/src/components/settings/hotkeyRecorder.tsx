import { useRef, useState } from 'react'

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

function formatHotkey(hotkey: string): string {
  if (hotkey === 'Win') return 'Win'
  return hotkey
    .split('+')
    .map((part) => (part === 'Super' ? 'Win' : part === 'CommandOrControl' ? 'Ctrl' : part))
    .join(' + ')
}

function buildAccelerator(event: React.KeyboardEvent): string | null {
  const key = event.key
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return null

  const mods: string[] = []
  if (event.ctrlKey) mods.push('Ctrl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  if (event.metaKey) mods.push('Super')

  let keyName = SPECIAL_KEY_MAP[key] ?? key
  if (keyName.length === 1) keyName = keyName.toUpperCase()
  if (/^F\d+$/.test(keyName)) keyName = keyName.toUpperCase()

  if (mods.length === 0 && !/^F\d+$/.test(keyName)) return null

  return [...mods, keyName].join('+')
}

export default function HotkeyRecorder({ value, defaultValue, onChange, disabled }: HotkeyRecorderProps) {
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

  function handleKey(event: React.KeyboardEvent) {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      stopRecording()
      return
    }
    const accelerator = buildAccelerator(event)
    if (accelerator) {
      setDraft(accelerator)
      onChange(accelerator)
      stopRecording()
    }
  }

  const showReset = !disabled && defaultValue !== undefined && value !== defaultValue
  const display = recording ? (draft ? formatHotkey(draft) : 'Press keys…') : formatHotkey(value)

  return (
    <div className="flex shrink-0 items-center gap-3">
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
        className={`focus-ring h-8 min-w-15 rounded-field border px-3 text-[12px] font-medium outline-none transition-colors ${
          disabled
            ? 'cursor-not-allowed border-line-hairline bg-fill-subtle text-ink-faint'
            : recording
              ? 'cursor-text border-focus-ring bg-surface-3 text-ink-primary'
              : 'cursor-pointer border-line-hairline bg-surface-2 text-ink-primary hover:bg-fill-subtle'
        }`}
      >
        {display}
      </button>
    </div>
  )
}

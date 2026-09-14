import { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { IconButton } from '@alpine/ui'

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

  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')

  let keyName = SPECIAL_KEY_MAP[key] ?? key
  if (keyName.length === 1) keyName = keyName.toUpperCase()
  if (/^F\d+$/.test(keyName)) keyName = keyName.toUpperCase()

  if (modifiers.length === 0 && !/^F\d+$/.test(keyName)) return null

  return [...modifiers, keyName].join('+')
}

export default function HotkeyRecorder({ value, fallback, onChange, disabled }: HotkeyRecorderProps) {
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

  const showReset = !disabled && value !== fallback
  const display = recording ? (draft ? formatHotkey(draft) : 'Press keys…') : formatHotkey(value)

  return (
    <div className="flex shrink-0 items-center gap-2">
      {showReset && (
        <IconButton label="Reset" onClick={() => onChange(fallback)}>
          <RotateCcw size={14} />
        </IconButton>
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
  )
}

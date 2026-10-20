import { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, IconButton } from '@alpine/ui'
import KeyCaps from './keyCaps'

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

  const showReset = !disabled && !recording && value !== fallback

  return (
    <div className="flex shrink-0 items-center gap-2">
      {recording ? (
        <button
          ref={recorderRef}
          type="button"
          aria-label="Press the new search hotkey"
          onKeyDown={handleKey}
          onBlur={stopRecording}
          className="focus-ring inline-flex h-[22px] items-center rounded-[5px] px-2 text-[11px] text-ink-primary ring-1 ring-ink-quiet"
        >
          {draft ? formatHotkey(draft) : 'Press a shortcut'}
        </button>
      ) : (
        <KeyCaps keys={formatHotkey(value).split(' + ')} />
      )}
      {showReset && (
        <IconButton label="Restore the default search hotkey" tooltip="topEnd" onClick={() => onChange(fallback)}>
          <RotateCcw size={14} />
        </IconButton>
      )}
      <Button
        shape="square"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={recording ? stopRecording : startRecording}
      >
        {recording ? 'Cancel' : 'Set'}
      </Button>
    </div>
  )
}

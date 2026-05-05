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
  if (hk === 'Win') return 'Windows key'
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
  const [current, setCurrent] = useState('Win')
  const [recording, setRecording] = useState(false)
  const [draft, setDraft] = useState('')
  const recorderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.launcher.getHotkey().then(setCurrent)
    window.launcher.onHotkeyChanged(setCurrent)
  }, [])

  function startRecording() {
    setDraft('')
    setRecording(true)
    requestAnimationFrame(() => recorderRef.current?.focus())
  }

  function stopRecording() {
    setRecording(false)
    setDraft('')
  }

  async function commit(hotkey: string) {
    const result = await window.launcher.setHotkey(hotkey)
    setCurrent(result)
    stopRecording()
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
      commit(acc)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hotkeys</h1>
        <p className="text-sm text-white/50 mt-1">Configure keyboard shortcuts.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="text-sm font-medium">Open search</div>
          <div className="text-xs text-white/40 mt-0.5">Shows the launcher from anywhere.</div>
        </div>
        <div className="flex gap-2 items-center">
          <div
            ref={recorderRef}
            tabIndex={0}
            onKeyDown={handleKey}
            onClick={() => !recording && startRecording()}
            onBlur={() => recording && stopRecording()}
            className={`px-4 h-9 rounded-md border min-w-[180px] flex items-center text-sm cursor-pointer outline-none transition-colors ${
              recording
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/90'
            }`}
          >
            {recording
              ? (draft ? formatHotkey(draft) : 'Press a key combination…')
              : formatHotkey(current)}
          </div>
          {current !== 'Win' && (
            <button
              onClick={() => commit('Win')}
              className="h-9 px-3 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              Use Windows key
            </button>
          )}
          {recording && (
            <button
              onClick={stopRecording}
              className="h-9 px-3 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
        <p className="text-xs text-white/40">
          Click the field and press a key combination. Esc cancels. The Windows key alone is supported as a special case.
        </p>
      </div>
    </div>
  )
}

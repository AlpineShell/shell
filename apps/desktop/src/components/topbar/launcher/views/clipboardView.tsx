import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useClipboardHistory } from "../../../../hooks/useClipboardHistory"
import { launcherColors } from "../launcherColors"

interface ClipboardViewProps {
  query: string
  darkText: boolean
  registerKeys: (handler: ((event: React.KeyboardEvent) => boolean) | null) => void
}

function matchesQuery(entry: ClipboardHistoryEntry, query: string): boolean {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true
  return entry.kind === "text" && entry.text.toLowerCase().includes(trimmed)
}

async function pasteEntry(entry: ClipboardHistoryEntry) {
  const restored = await window.clipboardHistory.restore(entry.id).catch(() => ({ ok: false }))
  if (restored.ok) await window.launcher.paste().catch(() => {})
  else window.launcher.hide()
}

function ClipboardRow({ entry, selected, darkText, onHover, onPick }: { entry: ClipboardHistoryEntry; selected: boolean; darkText: boolean; onHover: () => void; onPick: () => void }) {
  const colors = launcherColors(darkText)
  const rowRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" })
  }, [selected])

  return (
    <button
      ref={rowRef}
      type="button"
      onMouseEnter={onHover}
      onClick={onPick}
      className={`w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors ${selected ? colors.selected : colors.hover}`}
    >
      {entry.kind === "text" ? (
        <span className={`block text-[13px] leading-[18px] whitespace-pre-line break-words line-clamp-3 ${colors.text}`}>{entry.text.trim()}</span>
      ) : (
        <img src={entry.thumbnail} alt="" draggable={false} className="block max-h-24 max-w-full rounded" />
      )}
    </button>
  )
}

export function ClipboardView({ query, darkText, registerKeys }: ClipboardViewProps) {
  const colors = launcherColors(darkText)
  const history = useClipboardHistory()
  const entries = useMemo(() => history.filter((entry) => matchesQuery(entry, query)), [history, query])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIndex = Math.max(0, entries.findIndex((entry) => entry.id === selectedId))
  const selected = entries[selectedIndex] ?? null
  const latest = useRef({ entries, selectedIndex })

  useLayoutEffect(() => {
    latest.current = { entries, selectedIndex }
  })

  const move = useCallback((step: number) => {
    const { entries: shown, selectedIndex: current } = latest.current
    const next = shown[Math.min(shown.length - 1, Math.max(0, current + step))]
    if (next) setSelectedId(next.id)
  }, [])

  const removeSelected = useCallback(() => {
    const { entries: shown, selectedIndex: current } = latest.current
    const entry = shown[current]
    if (!entry) return
    setSelectedId(shown[current + 1]?.id ?? shown[current - 1]?.id ?? null)
    window.clipboardHistory.remove(entry.id).catch(() => {})
  }, [])

  useEffect(() => {
    registerKeys((event) => {
      if (event.key === "ArrowDown") { move(1); return true }
      if (event.key === "ArrowUp") { move(-1); return true }
      if (event.key === "Enter") { if (selected) pasteEntry(selected); return true }
      if (event.key === "Delete" && query === "") { removeSelected(); return true }
      return false
    })
    return () => registerKeys(null)
  })

  if (entries.length === 0) {
    return <div className={`px-4 py-6 text-[13px] ${colors.dim}`}>{history.length === 0 ? "Nothing copied yet" : "No matches"}</div>
  }

  return (
    <div className={`flex flex-col gap-0.5 p-2 max-h-[360px] overflow-y-auto cc-scroll ${darkText ? "cc-scroll-light" : ""}`}>
      {entries.map((entry) => (
        <ClipboardRow
          key={entry.id}
          entry={entry}
          selected={entry.id === selected?.id}
          darkText={darkText}
          onHover={() => setSelectedId(entry.id)}
          onPick={() => pasteEntry(entry)}
        />
      ))}
    </div>
  )
}

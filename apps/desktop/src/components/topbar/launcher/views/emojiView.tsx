import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { EMOJIS, type EmojiEntry } from "../../../../lib/emojiData"
import { getRenderableEmojis } from "../../../../lib/emojiRenderable"
import { scoreField } from "../../../../lib/launcherSearch"
import { launcherColors } from "../launcherColors"

const COLUMNS = 9
const SEARCH_LIMIT = 180
const CELL_HEIGHT = 40
const ROW_GAP = 2
const ROW_PITCH = CELL_HEIGHT + ROW_GAP
const GRID_PADDING = 8
const GRID_MAX_HEIGHT = 264
const OVERSCAN_ROWS = 2
const EMOJI_BY_CHAR = new Map(EMOJIS.map((entry) => [entry.c, entry]))

interface EmojiViewProps {
  query: string
  darkText: boolean
  insertIntoForeground: boolean
  capturesKeys: boolean
  onQueryChange: (update: (query: string) => string) => void
  registerKeys: (handler: ((event: React.KeyboardEvent) => boolean) | null) => void
}

function filterEmojis(query: string, recent: EmojiEntry[]): EmojiEntry[] {
  const all = getRenderableEmojis()
  const trimmed = query.trim()
  if (!trimmed) {
    const recentChars = new Set(recent.map((entry) => entry.c))
    return [...recent, ...all.filter((entry) => !recentChars.has(entry.c))]
  }
  const scored: { entry: EmojiEntry; score: number }[] = []
  for (const entry of all) {
    const score = Math.max(scoreField(trimmed, entry.n), scoreField(trimmed, entry.s))
    if (score >= 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, SEARCH_LIMIT).map(({ entry }) => entry)
}

function moveInGrid(index: number, key: string, count: number): number | null {
  if (key === "ArrowRight") return Math.min(index + 1, count - 1)
  if (key === "ArrowLeft") return Math.max(index - 1, 0)
  if (key === "ArrowDown") return Math.min(index + COLUMNS, count - 1)
  if (key === "ArrowUp") return Math.max(index - COLUMNS, 0)
  return null
}

const EmojiCell = memo(function EmojiCell({ entry, index, selected, darkText, onHover, onPick }: { entry: EmojiEntry; index: number; selected: boolean; darkText: boolean; onHover: (index: number) => void; onPick: (index: number) => void }) {
  const colors = launcherColors(darkText)
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(index)}
      onClick={() => onPick(index)}
      title={entry.n}
      style={{ gridRowStart: Math.floor(index / COLUMNS) + 1, gridColumnStart: (index % COLUMNS) + 1 }}
      className={`flex items-center justify-center h-10 rounded-md cursor-pointer transition-colors text-[22px] leading-none ${selected ? colors.selected : colors.hover}`}
    >
      <span>{entry.c}</span>
    </button>
  )
})

function EmojiGrid({ emojis, selectedIndex, darkText, onHover, onPick }: { emojis: EmojiEntry[]; selectedIndex: number; darkText: boolean; onHover: (index: number) => void; onPick: (index: number) => void }) {
  const colors = launcherColors(darkText)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(GRID_MAX_HEIGHT)
  const selected = emojis[selectedIndex]
  const rowCount = Math.ceil(emojis.length / COLUMNS)

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    setViewportHeight(element.clientHeight)
    setScrollTop(element.scrollTop)
  }, [emojis.length])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const rowTop = GRID_PADDING + Math.floor(selectedIndex / COLUMNS) * ROW_PITCH
    const rowBottom = rowTop + CELL_HEIGHT
    if (rowTop < element.scrollTop) element.scrollTop = rowTop
    else if (rowBottom > element.scrollTop + element.clientHeight) element.scrollTop = rowBottom - element.clientHeight
  }, [selectedIndex])

  if (emojis.length === 0) return <div className={`px-4 py-6 text-[13px] ${colors.dim}`}>No emoji found</div>

  const firstRow = Math.max(0, Math.floor((scrollTop - GRID_PADDING) / ROW_PITCH) - OVERSCAN_ROWS)
  const lastRow = Math.min(rowCount - 1, Math.floor((scrollTop + viewportHeight - GRID_PADDING) / ROW_PITCH) + OVERSCAN_ROWS)
  const visible: EmojiEntry[] = emojis.slice(firstRow * COLUMNS, Math.min(emojis.length, (lastRow + 1) * COLUMNS))

  return (
    <div className="flex flex-col">
      <div
        ref={scrollRef}
        onScroll={() => { const element = scrollRef.current; if (element) setScrollTop(element.scrollTop) }}
        className={`grid gap-0.5 p-2 max-h-[264px] overflow-y-auto cc-scroll ${darkText ? "cc-scroll-light" : ""}`}
        style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowCount}, ${CELL_HEIGHT}px)` }}
      >
        {visible.map((entry, offset) => {
          const index = firstRow * COLUMNS + offset
          return <EmojiCell key={entry.c} entry={entry} index={index} selected={index === selectedIndex} darkText={darkText} onHover={onHover} onPick={onPick} />
        })}
      </div>
      {selected && (
        <>
          <div className={`h-px w-full ${colors.divider}`} />
          <div className={`px-4 h-9 flex items-center gap-2 text-[12px] ${colors.dim}`}>
            <span className="text-[16px] leading-none">{selected.c}</span>
            <span className="truncate capitalize">{selected.n}</span>
          </div>
        </>
      )}
    </div>
  )
}

export function EmojiView({ query, darkText, insertIntoForeground, capturesKeys, onQueryChange, registerKeys }: EmojiViewProps) {
  const [recent, setRecent] = useState<EmojiEntry[]>([])
  const [selection, setSelection] = useState({ query: "", index: 0 })
  const emojis = useMemo(() => filterEmojis(query, recent), [query, recent])
  const selectedIndex = selection.query === query ? Math.min(selection.index, Math.max(0, emojis.length - 1)) : 0
  const latest = useRef({ emojis, selectedIndex, query })

  useLayoutEffect(() => {
    latest.current = { emojis, selectedIndex, query }
  })

  useEffect(() => {
    window.launcher.recentEmoji()
      .then((chars) => setRecent(chars.map((char) => EMOJI_BY_CHAR.get(char)).filter((entry): entry is EmojiEntry => !!entry)))
      .catch(() => {})
  }, [])

  const pick = useCallback((index: number) => {
    const entry = latest.current.emojis[index]
    if (!entry) return
    window.launcher.addRecentEmoji(entry.c).catch(() => {})
    const copy = () => navigator.clipboard.writeText(entry.c).catch(() => {})
    if (insertIntoForeground) {
      window.launcher.insertText(entry.c).then((result) => { if (!result?.ok) copy() }).catch(copy)
      return
    }
    copy()
    window.launcher.hide()
  }, [insertIntoForeground])

  const hover = useCallback((index: number) => setSelection({ query: latest.current.query, index }), [])

  useEffect(() => {
    registerKeys((event) => {
      if (event.key === "Enter") { pick(selectedIndex); return true }
      const next = moveInGrid(selectedIndex, event.key, emojis.length)
      if (next === null) return false
      setSelection({ query, index: next })
      return true
    })
    return () => registerKeys(null)
  })

  useEffect(() => {
    if (!capturesKeys) return
    return window.launcher.onEmojiKey((message) => {
      const { emojis: shown, selectedIndex: current, query: currentQuery } = latest.current
      if (message.kind === "escape") window.launcher.hide()
      else if (message.kind === "enter") pick(current)
      else if (message.kind === "char") onQueryChange((text) => text + message.value)
      else if (message.kind === "backspace") onQueryChange((text) => text.slice(0, -1))
      else {
        const key = { right: "ArrowRight", left: "ArrowLeft", down: "ArrowDown", up: "ArrowUp" }[message.kind]
        const next = moveInGrid(current, key, shown.length)
        if (next !== null && shown.length > 0) setSelection({ query: currentQuery, index: next })
      }
    })
  }, [capturesKeys, onQueryChange, pick])

  return <EmojiGrid emojis={emojis} selectedIndex={selectedIndex} darkText={darkText} onHover={hover} onPick={pick} />
}

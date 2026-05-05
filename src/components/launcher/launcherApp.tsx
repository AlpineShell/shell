import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useTopbarColor } from '../../hooks/useTopbarColor'

const CORNER = 12
const MAX_RESULTS = 5
const ENTER_MS = 220
const EXIT_MS = 100

function score(query: string, name: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  if (n === q) return 1000
  if (n.startsWith(q)) return 500 - n.length
  const idx = n.indexOf(q)
  if (idx >= 0) return 200 - idx - n.length * 0.1
  let qi = 0
  let lastMatch = -1
  let gaps = 0
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) {
      if (lastMatch >= 0) gaps += i - lastMatch - 1
      lastMatch = i
      qi++
    }
  }
  if (qi === q.length) return 100 - gaps
  return -1
}

export default function LauncherApp() {
  const wallpaperColor = useTopbarColor()
  const [displayId, setDisplayId] = useState<number | null>(null)
  const [fgColor, setFgColor] = useState<TopBarColor | null>(null)

  const color = fgColor || wallpaperColor
  const fullscreenWindow = fgColor !== null
  const bg = color ? `rgb(${color.r},${color.g},${color.b})` : 'rgb(31,32,32)'
  const darkText = color?.darkText ?? false
  const borderColor = fullscreenWindow ? (darkText ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)') : null
  const textColor = darkText ? 'text-black' : 'text-white'
  const dimText = darkText ? 'text-black/50' : 'text-white/50'
  const hoverBg = darkText ? 'hover:bg-black/10' : 'hover:bg-white/10'
  const selectedBg = darkText ? 'bg-black/10' : 'bg-white/10'
  const placeholderColor = darkText ? 'placeholder:text-black/40' : 'placeholder:text-white/40'

  const [items, setItems] = useState<LauncherItem[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [resultsHeight, setResultsHeight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const displayIdRef = useRef<number | null>(null)

  useEffect(() => {
    window.launcher.index().then(setItems)
    window.launcher.onIndexChanged(setItems)
    window.launcher.onShow((data) => {
      setDisplayId(data.displayId)
      setQuery('')
      setSelected(0)
      setClosing(false)
      setVisible(true)
      requestAnimationFrame(() => inputRef.current?.focus())
    })
    window.launcher.onStartClose(() => {
      setClosing(true)
      setVisible(false)
    })
    window.launcher.onHide(() => {
      setVisible(false)
      setClosing(false)
    })
    window.topbar.onForegroundColorChanged((data) => {
      const id = displayIdRef.current
      if (id == null || data.displayId !== id) return
      if ('r' in data) setFgColor({ r: data.r, g: data.g, b: data.b, darkText: data.darkText })
      else setFgColor(null)
    })
  }, [])

  useEffect(() => {
    displayIdRef.current = displayId
    if (displayId == null) return
    window.topbar.foregroundColor().then((list) => {
      const match = list.find((d) => d.displayId === displayId)
      setFgColor(match ? { r: match.r, g: match.g, b: match.b, darkText: match.darkText } : null)
    })
  }, [displayId])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const scored: { item: LauncherItem; s: number }[] = []
    for (const item of items) {
      const s = score(query, item.name)
      if (s >= 0) scored.push({ item, s })
    }
    scored.sort((a, b) => b.s - a.s)
    return scored.slice(0, MAX_RESULTS).map((r) => r.item)
  }, [query, items])

  useEffect(() => {
    if (selected >= results.length) setSelected(0)
  }, [results, selected])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (!query.trim()) {
        setResultsHeight(0)
      } else if (resultsRef.current) {
        setResultsHeight(resultsRef.current.offsetHeight)
      }
    })
  }, [query, results])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      window.launcher.hide()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[selected]
      if (item) window.launcher.launch(item.id)
    }
  }

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const cornerBg = borderColor
    ? `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${borderColor} ${CORNER}px, ${borderColor} ${CORNER + 0.5}px, ${bg} ${CORNER + 0.5}px)`
    : `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${bg} ${CORNER}px)`
  const cornerBgRight = borderColor
    ? `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${borderColor} ${CORNER}px, ${borderColor} ${CORNER + 0.5}px, ${bg} ${CORNER + 0.5}px)`
    : `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${bg} ${CORNER}px)`

  const transition = closing
    ? `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
    : `transform ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`

  return (
    <div className="w-screen h-screen flex justify-center items-start">
      <div
        className="relative"
        style={{
          width: 600,
          transform: visible ? 'translateY(0)' : 'translateY(-24px)',
          opacity: visible ? 1 : 0,
          transition,
          willChange: 'transform, opacity',
        }}
      >
        <div className="absolute top-0 right-full" style={{ width: CORNER, height: CORNER, background: cornerBg }} />
        <div className="absolute top-0 left-full" style={{ width: CORNER, height: CORNER, background: cornerBgRight }} />
        <div className="relative">
          <div className="overflow-hidden rounded-b-xl shadow-2xl flex flex-col" style={{ backgroundColor: bg, transition: 'background-color 300ms ease' }}>
            <div className={`flex items-center gap-2 px-4 h-12 shrink-0 ${textColor}`}>
              <Search size={16} className="shrink-0 opacity-60" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Search apps"
                autoFocus
                className={`flex-1 bg-transparent outline-none text-[15px] ${placeholderColor}`}
              />
            </div>
            <div
              className="overflow-hidden"
              style={{ height: resultsHeight, transition: 'height 200ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
              <div ref={resultsRef}>
                {query.trim() && (
                  <>
                    <div className={`h-px w-full ${darkText ? 'bg-black/10' : 'bg-white/10'}`} />
                    {results.length > 0 ? (
                      <div ref={listRef} className="flex flex-col p-1.5 gap-0.5">
                        {results.map((item, i) => (
                          <button
                            key={item.id}
                            onMouseMove={() => setSelected(i)}
                            onClick={() => window.launcher.launch(item.id)}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                              i === selected ? selectedBg : hoverBg
                            }`}
                          >
                            {item.icon ? (
                              <img src={item.icon} alt="" className="w-7 h-7 shrink-0" draggable={false} />
                            ) : (
                              <div className={`w-7 h-7 shrink-0 rounded ${darkText ? 'bg-black/10' : 'bg-white/10'}`} />
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className={`text-[13px] truncate ${textColor}`}>{item.name}</span>
                              <span className={`text-[11px] truncate ${dimText}`}>{item.target}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className={`px-4 py-4 text-[13px] ${dimText}`}>No results</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          {borderColor && (
            <div
              style={{
                position: 'absolute',
                top: CORNER,
                left: 0,
                right: 0,
                bottom: 0,
                borderLeft: `0.5px solid ${borderColor}`,
                borderRight: `0.5px solid ${borderColor}`,
                borderBottom: `0.5px solid ${borderColor}`,
                borderRadius: '0 0 12px 12px',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

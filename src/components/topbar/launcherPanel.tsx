import { createPortal } from "react-dom"
import { useEffect, useMemo, useRef, useState } from "react"
import { Search, ChevronLeft, ShieldCheck, FolderOpen, Trash2, Equal, Copy } from "lucide-react"
import { useTopbarBg, useDarkText, useFullscreenWindow } from "../themeContext"

const CORNER = 12
const MAX_RESULTS = 5
const LAUNCHER_WIDTH = 600

function score(query: string, name: string): number {
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  if (n === q) return 1000
  if (n.startsWith(q)) return 500
  let qi = 0
  let consecutive = 0
  let maxConsecutive = 0
  let firstMatch = -1
  for (let ni = 0; ni < n.length && qi < q.length; ni++) {
    if (n[ni] === q[qi]) {
      if (firstMatch < 0) firstMatch = ni
      consecutive++
      maxConsecutive = Math.max(maxConsecutive, consecutive)
      qi++
    } else {
      consecutive = 0
    }
  }
  if (qi < q.length) return -1
  return maxConsecutive * 10 - firstMatch
}

function tryMath(expr: string): string | null {
  if (!/[0-9]/.test(expr) || !/[+\-*/%^]/.test(expr)) return null
  if (!/^[\d\s+\-*/.%^(),]+$/.test(expr)) return null
  try {
    const sanitized = expr.replace(/\^/g, "**").replace(/,/g, ".")
    const result = new Function(`"use strict"; return (${sanitized})`)()
    if (typeof result !== "number" || !isFinite(result)) return null
    return Number.isInteger(result) ? result.toString() : parseFloat(result.toPrecision(12)).toString()
  } catch {
    return null
  }
}

interface LauncherPanelProps {
  onGapChange: (gap: { left: number; right: number } | null) => void
}

interface ContextAction {
  label: string
  icon: typeof ShieldCheck
  action: (id: number) => void
  show?: (item: LauncherItem) => boolean
}

const CONTEXT_ACTIONS: ContextAction[] = [
  { label: "Run as administrator", icon: ShieldCheck, action: (id) => window.launcher.launchAdmin(id) },
  { label: "Open file location", icon: FolderOpen, action: (id) => window.launcher.openLocation(id), show: (item) => !!item.lnkPath },
  { label: "Uninstall", icon: Trash2, action: (id) => window.launcher.uninstall(id) },
]

export default function LauncherPanel({ onGapChange }: LauncherPanelProps) {
  const bg = useTopbarBg()
  const darkText = useDarkText()
  const fullscreenWindow = useFullscreenWindow()
  const borderColor = fullscreenWindow ? (darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)") : null
  const textColor = darkText ? "text-black" : "text-white"
  const dimText = darkText ? "text-black/50" : "text-white/50"
  const hoverBg = darkText ? "hover:bg-black/5" : "hover:bg-white/5"
  const selectedBg = darkText ? "bg-black/10" : "bg-white/10"
  const placeholderColor = darkText ? "placeholder:text-black/40" : "placeholder:text-white/40"

  const [items, setItems] = useState<LauncherItem[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [closing, setClosing] = useState(false)
  const [resultsHeight, setResultsHeight] = useState(0)
  const [contextOpen, setContextOpen] = useState(false)
  const [contextSelected, setContextSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.launcher.index().then(setItems)
    window.launcher.onIndexChanged(setItems)
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      window.topbar.setHeight(24)
    }
  }, [])

  useEffect(() => {
    const left = Math.round((window.innerWidth - LAUNCHER_WIDTH) / 2) - CORNER
    const right = left + LAUNCHER_WIDTH + CORNER * 2
    onGapChange({ left, right })
    return () => onGapChange(null)
  }, [])

  useEffect(() => {
    const onStartClose = () => setClosing(true)
    const onHide = () => setClosing(false)
    window.launcher.onStartClose(onStartClose)
    window.launcher.onHide(onHide)
  }, [])

  useEffect(() => {
    const onBlur = () => window.launcher.hide()
    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [])

  const mathResult = useMemo(() => tryMath(query.trim()), [query])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const scored: { item: LauncherItem; s: number }[] = []
    for (const item of items) {
      const s = score(query, item.name)
      if (s >= 0) scored.push({ item, s })
    }
    scored.sort((a, b) => b.s - a.s)
    const limit = mathResult ? MAX_RESULTS - 1 : MAX_RESULTS
    return scored.slice(0, limit).map((r) => r.item)
  }, [query, items, mathResult])

  const totalCount = (mathResult ? 1 : 0) + results.length
  const mathSelected = mathResult && selected === 0
  const appIndex = mathResult ? selected - 1 : selected
  const selectedApp = !mathSelected && appIndex >= 0 ? results[appIndex] : null

  const contextItem = contextOpen ? selectedApp : null
  const contextActions = useMemo(() => {
    if (!contextItem) return []
    return CONTEXT_ACTIONS.filter((a) => !a.show || a.show(contextItem))
  }, [contextItem])

  useEffect(() => {
    if (selected >= totalCount) setSelected(0)
    setContextOpen(false)
  }, [results, mathResult])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (!query.trim()) {
        setResultsHeight(0)
      } else if (resultsRef.current) {
        setResultsHeight(resultsRef.current.offsetHeight)
      }
    })
  }, [query, results, contextOpen])

  function handleKey(e: React.KeyboardEvent) {
    if (contextOpen) {
      if (e.key === "Escape" || e.key === "ArrowLeft") {
        e.preventDefault()
        setContextOpen(false)
        requestAnimationFrame(() => inputRef.current?.focus())
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setContextSelected((s) => Math.min(s + 1, contextActions.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setContextSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const action = contextActions[contextSelected]
        if (action && contextItem) action.action(contextItem.id)
      }
      return
    }

    if (e.key === "Escape") {
      e.preventDefault()
      window.launcher.hide()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, totalCount - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === "ArrowRight" && selectedApp) {
      e.preventDefault()
      setContextOpen(true)
      setContextSelected(0)
      requestAnimationFrame(() => panelRef.current?.focus())
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (mathSelected && mathResult) {
        navigator.clipboard.writeText(mathResult)
        window.launcher.hide()
      } else if (selectedApp) {
        window.launcher.launch(selectedApp.id)
      }
    }
  }

  useEffect(() => {
    if (contextOpen) return
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [selected, contextOpen])

  const left = Math.round((window.innerWidth - LAUNCHER_WIDTH) / 2)

  const cornerBg = borderColor
    ? `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${borderColor} ${CORNER}px, ${borderColor} ${CORNER + 0.5}px, ${bg} ${CORNER + 0.5}px)`
    : `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${bg} ${CORNER}px)`
  const cornerBgRight = borderColor
    ? `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${borderColor} ${CORNER}px, ${borderColor} ${CORNER + 0.5}px, ${bg} ${CORNER + 0.5}px)`
    : `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${bg} ${CORNER}px)`

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onMouseDown={() => window.launcher.hide()}
    >
      <div
        ref={panelRef}
        className={`absolute ${closing ? "menu-exit" : "menu-enter"}`}
        style={{ top: 24, left, width: LAUNCHER_WIDTH, outline: "none" }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={contextOpen ? handleKey : undefined}
        tabIndex={-1}
      >
        <div className="absolute top-0 right-full" style={{ width: CORNER, height: CORNER, background: cornerBg }} />
        <div className="absolute top-0 left-full" style={{ width: CORNER, height: CORNER, background: cornerBgRight }} />
        <div className="relative">
          <div className="overflow-hidden rounded-b-xl shadow-2xl flex flex-col" style={{ backgroundColor: bg, transition: "background-color 300ms ease" }}>
            <div className={`flex items-center gap-2 px-4 h-12 shrink-0 ${textColor}`}>
              {contextOpen ? (
                <button
                  onMouseDown={(e) => { e.preventDefault(); setContextOpen(false); requestAnimationFrame(() => inputRef.current?.focus()) }}
                  className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
              ) : (
                <Search size={16} className="shrink-0 opacity-60" />
              )}
              {contextOpen && contextItem ? (
                <span className={`flex-1 text-[15px] truncate ${textColor}`}>{contextItem.name}</span>
              ) : (
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
              )}
            </div>
            <div
              className="overflow-hidden"
              style={{ height: resultsHeight, transition: "height 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
            >
              <div ref={resultsRef}>
                {contextOpen && contextItem ? (
                  <>
                    <div className={`h-px w-full ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                    <div className="flex flex-col p-1.5 gap-0.5">
                      {contextActions.map((action, ci) => {
                        const Icon = action.icon
                        return (
                          <button
                            key={action.label}
                            onMouseMove={() => setContextSelected(ci)}
                            onClick={() => action.action(contextItem.id)}
                            className={`w-full flex items-center gap-3 px-2.5 h-10 rounded-md text-left text-[13px] cursor-pointer transition-colors ${textColor} ${
                              ci === contextSelected ? selectedBg : hoverBg
                            }`}
                          >
                            <Icon size={16} className={`shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                            {action.label}
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : query.trim() && (mathResult || results.length > 0) ? (
                  <>
                    <div className={`h-px w-full ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                    <div ref={listRef} className="flex flex-col p-1.5 gap-0.5">
                      {mathResult && (
                        <button
                          onMouseMove={() => setSelected(0)}
                          onClick={() => { navigator.clipboard.writeText(mathResult); window.launcher.hide() }}
                          className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                            mathSelected ? selectedBg : hoverBg
                          }`}
                        >
                          <Equal size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                          <span className={`flex-1 text-[15px] font-medium ${textColor}`}>{mathResult}</span>
                          <Copy size={13} className={`shrink-0 ${darkText ? "text-black/25" : "text-white/25"}`} />
                        </button>
                      )}
                      {results.map((item, i) => {
                        const idx = mathResult ? i + 1 : i
                        return (
                          <button
                            key={item.id}
                            onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                            onClick={() => window.launcher.launch(item.id)}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                              idx === selected ? selectedBg : hoverBg
                            }`}
                          >
                            {item.icon ? (
                              <img src={item.icon} alt="" className="w-7 h-7 shrink-0" draggable={false} />
                            ) : (
                              <div className={`w-7 h-7 shrink-0 rounded ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                            )}
                            <span className={`text-[13px] truncate ${textColor}`}>{item.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : query.trim() ? (
                  <div className={`px-4 py-4 text-[13px] ${dimText}`}>No results</div>
                ) : null}
              </div>
            </div>
          </div>
          {borderColor && (
            <div
              style={{
                position: "absolute",
                top: CORNER,
                left: 0,
                right: 0,
                bottom: 0,
                borderLeft: `0.5px solid ${borderColor}`,
                borderRight: `0.5px solid ${borderColor}`,
                borderBottom: `0.5px solid ${borderColor}`,
                borderRadius: "0 0 12px 12px",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

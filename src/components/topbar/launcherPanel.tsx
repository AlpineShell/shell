import { createPortal } from "react-dom"
import { useEffect, useMemo, useRef, useState } from "react"
import { Search, ChevronLeft, ShieldCheck, FolderOpen, Trash2, Equal, Copy, X, SkullIcon, MapPin } from "lucide-react"
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

interface MapResult {
  lat: number
  lon: number
  display: string
}

function useAddressLookup(query: string): MapResult | null {
  const [result, setResult] = useState<MapResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setResult(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (q.length < 5 || /^[\d\s+\-*/%^(),.*]+$/.test(q)) return
    if (!/\d/.test(q) || !/[a-zA-ZäöüÄÖÜß]/.test(q)) return

    timerRef.current = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": "AlpineShell/1.0" },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.[0]) {
            setResult({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name })
          }
        })
        .catch(() => {})
    }, 400)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  return result
}

function staticMapUrl(lat: number, lon: number, width: number, height: number): string {
  const zoom = 15
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom))
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom))
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

interface LauncherPanelProps {
  onGapChange: (gap: { left: number; right: number } | null) => void
}

interface ContextAction {
  label: string
  icon: typeof ShieldCheck
  action: () => void
}

function appActions(item: LauncherItem): ContextAction[] {
  const actions: ContextAction[] = [
    { label: "Run as administrator", icon: ShieldCheck, action: () => window.launcher.launchAdmin(item.id) },
  ]
  if (item.lnkPath) {
    actions.push({ label: "Open file location", icon: FolderOpen, action: () => window.launcher.openLocation(item.id) })
  }
  actions.push({ label: "Uninstall", icon: Trash2, action: () => window.launcher.uninstall(item.id) })
  return actions
}

function openAppActions(app: OpenApp): ContextAction[] {
  return [
    { label: "Close window", icon: X, action: () => window.launcher.closeWindow(app.hwnd) },
    { label: "End task", icon: SkullIcon, action: () => window.launcher.endTask(app.id) },
  ]
}

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
  const [openApps, setOpenApps] = useState<OpenApp[]>([])
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
    window.shell.windows.openApps().then(setOpenApps)
    window.shell.windows.onOpenAppsChanged(setOpenApps)
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
  const mapResult = useAddressLookup(query)

  const matchedOpenApps = useMemo(() => {
    if (!query.trim()) return []
    const matched: { app: OpenApp; s: number }[] = []
    for (const app of openApps) {
      const nameScore = score(query, app.name)
      const titleScore = score(query, app.title)
      const best = Math.max(nameScore, titleScore)
      if (best >= 0) matched.push({ app, s: best })
    }
    matched.sort((a, b) => b.s - a.s)
    return matched.slice(0, 3).map((r) => r.app)
  }, [query, openApps])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const openPaths = new Set(matchedOpenApps.map((a) => a.path.toLowerCase()))
    const scored: { item: LauncherItem; s: number }[] = []
    for (const item of items) {
      if (openPaths.has(item.target.toLowerCase())) continue
      const s = score(query, item.name)
      if (s >= 0) scored.push({ item, s })
    }
    scored.sort((a, b) => b.s - a.s)
    const taken = (mathResult ? 1 : 0) + (mapResult ? 1 : 0) + matchedOpenApps.length
    const limit = Math.max(1, MAX_RESULTS - taken)
    return scored.slice(0, limit).map((r) => r.item)
  }, [query, items, mathResult, mapResult, matchedOpenApps])

  const mathOffset = mathResult ? 1 : 0
  const mapOffset = mathOffset + (mapResult ? 1 : 0)
  const openOffset = mapOffset + matchedOpenApps.length
  const totalCount = openOffset + results.length

  const selectedEntry = useMemo(() => {
    if (mathResult && selected === 0) return { type: "math" as const }
    if (mapResult && selected === mathOffset) return { type: "map" as const, result: mapResult }
    if (selected >= mapOffset && selected < openOffset) return { type: "open" as const, app: matchedOpenApps[selected - mapOffset] }
    if (selected >= openOffset) return { type: "app" as const, item: results[selected - openOffset] }
    return null
  }, [selected, mathResult, mapResult, matchedOpenApps, results, mathOffset, mapOffset, openOffset])

  const contextActions = useMemo(() => {
    if (!contextOpen || !selectedEntry) return []
    if (selectedEntry.type === "app" && selectedEntry.item) return appActions(selectedEntry.item)
    if (selectedEntry.type === "open") return openAppActions(selectedEntry.app)
    return []
  }, [contextOpen, selectedEntry])

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
  }, [query, results, contextOpen, mapResult])

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
        if (action) action.action()
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
    } else if (e.key === "ArrowRight" && selectedEntry && (selectedEntry.type === "app" || selectedEntry.type === "open")) {
      e.preventDefault()
      setContextOpen(true)
      setContextSelected(0)
      requestAnimationFrame(() => panelRef.current?.focus())
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (!selectedEntry) return
      if (selectedEntry.type === "math" && mathResult) {
        navigator.clipboard.writeText(mathResult)
        window.launcher.hide()
      } else if (selectedEntry.type === "map") {
        window.open(`https://www.openstreetmap.org/?mlat=${selectedEntry.result.lat}&mlon=${selectedEntry.result.lon}#map=16/${selectedEntry.result.lat}/${selectedEntry.result.lon}`)
        window.launcher.hide()
      } else if (selectedEntry.type === "open") {
        window.alttab.activate(selectedEntry.app.hwnd)
        window.launcher.hide()
      } else if (selectedEntry.type === "app" && selectedEntry.item) {
        window.launcher.launch(selectedEntry.item.id)
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
              {contextOpen && selectedEntry ? (
                <span className={`flex-1 text-[15px] truncate ${textColor}`}>
                  {selectedEntry.type === "app" ? selectedEntry.item?.name : selectedEntry.type === "open" ? selectedEntry.app.name : ""}
                </span>
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
                {contextOpen && contextActions.length > 0 ? (
                  <>
                    <div className={`h-px w-full ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                    <div className="flex flex-col p-1.5 gap-0.5">
                      {contextActions.map((action, ci) => {
                        const Icon = action.icon
                        return (
                          <button
                            key={action.label}
                            onMouseMove={() => setContextSelected(ci)}
                            onClick={() => action.action()}
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
                ) : query.trim() && totalCount > 0 ? (
                  <>
                    <div className={`h-px w-full ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                    <div ref={listRef} className="flex flex-col p-1.5 gap-0.5">
                      {mathResult && (
                        <button
                          onMouseMove={() => setSelected(0)}
                          onClick={() => { navigator.clipboard.writeText(mathResult); window.launcher.hide() }}
                          className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                            selected === 0 ? selectedBg : hoverBg
                          }`}
                        >
                          <Equal size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                          <span className={`flex-1 text-[15px] font-medium ${textColor}`}>{mathResult}</span>
                          <Copy size={13} className={`shrink-0 ${darkText ? "text-black/25" : "text-white/25"}`} />
                        </button>
                      )}
                      {mapResult && (
                        <button
                          onMouseMove={() => setSelected(mathOffset)}
                          onClick={() => { window.open(`https://www.openstreetmap.org/?mlat=${mapResult.lat}&mlon=${mapResult.lon}#map=16/${mapResult.lat}/${mapResult.lon}`); window.launcher.hide() }}
                          className={`flex items-center gap-3 px-2.5 rounded-md text-left cursor-pointer transition-colors overflow-hidden ${
                            selected === mathOffset ? selectedBg : hoverBg
                          }`}
                          style={{ height: 140 }}
                        >
                          <div className="w-full h-full flex flex-col gap-1.5 py-2">
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className={`shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                              <span className={`text-[13px] truncate ${textColor}`}>{mapResult.display.split(",").slice(0, 3).join(",")}</span>
                            </div>
                            <div className="flex-1 rounded-md overflow-hidden relative">
                              <img
                                src={staticMapUrl(mapResult.lat, mapResult.lon, 256, 256)}
                                alt=""
                                className="w-full h-full object-cover"
                                draggable={false}
                              />
                            </div>
                          </div>
                        </button>
                      )}
                      {matchedOpenApps.map((app, i) => {
                        const idx = mapOffset + i
                        return (
                          <button
                            key={`open-${app.hwnd}`}
                            onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                            onClick={() => { window.alttab.activate(app.hwnd); window.launcher.hide() }}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                              idx === selected ? selectedBg : hoverBg
                            }`}
                          >
                            {app.icon ? (
                              <img src={app.icon} alt="" className="w-7 h-7 shrink-0" draggable={false} />
                            ) : (
                              <div className={`w-7 h-7 shrink-0 rounded ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                            )}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className={`text-[13px] truncate ${textColor}`}>{app.name}</span>
                              <span className={`text-[11px] truncate ${dimText}`}>{app.title}</span>
                            </div>
                          </button>
                        )
                      })}
                      {matchedOpenApps.length > 0 && results.length > 0 && (
                        <div className={`h-px mx-2 my-0.5 ${darkText ? "bg-black/5" : "bg-white/5"}`} />
                      )}
                      {results.map((item, i) => {
                        const idx = openOffset + i
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

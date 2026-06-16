import { createPortal } from "react-dom"
import { useEffect, useMemo, useRef, useState } from "react"
import { Search, ChevronLeft, ShieldCheck, FolderOpen, Trash2, Equal, Copy, X, SkullIcon, MapPin, Wallpaper, Settings2, Minimize2, Maximize2, Loader2, Terminal, Globe, FileText, Play } from "lucide-react"
import { useTopbarBg, useDarkText, useFullscreenWindow } from "../themeContext"
import { useWallpaper } from "../../hooks/useWallpaper"
import { useFlyUnderBar } from "../../hooks/useFlyUnderBar"

const CORNER = 12
const MAX_RESULTS = 5
const LAUNCHER_WIDTH_DEFAULT = 600
const WALLPAPER_TILE_WIDTH = 200
const WALLPAPER_TILE_GAP = 12
const WALLPAPER_PANEL_PADDING_X = 16
const WALLPAPER_MAX_VISIBLE = 5
const WIDTH_TRANSITION = "width 240ms cubic-bezier(0.16, 1, 0.3, 1), left 240ms cubic-bezier(0.16, 1, 0.3, 1)"

function wallpaperPanelWidth(visibleCount: number): number {
  if (visibleCount <= 0) return LAUNCHER_WIDTH_DEFAULT
  const tiles = Math.min(visibleCount, WALLPAPER_MAX_VISIBLE)
  return tiles * WALLPAPER_TILE_WIDTH + (tiles - 1) * WALLPAPER_TILE_GAP + WALLPAPER_PANEL_PADDING_X * 2
}

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

function useRunCommand(query: string): RunResult | null {
  const [result, setResult] = useState<RunResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setResult(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (q.length < 2 || !window.shell.run) return

    timerRef.current = setTimeout(() => {
      window.shell.run.resolve(q).then((r) => setResult(r)).catch(() => setResult(null))
    }, 90)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  return result
}

const RUN_ICONS = { folder: FolderOpen, file: FileText, url: Globe, shell: FolderOpen, command: Terminal }

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

type SettingId = "wallpaper"

interface SettingCommand {
  id: SettingId
  label: string
  hint: string
  icon: typeof Wallpaper
  keywords: string[]
}

const SETTINGS: SettingCommand[] = [
  {
    id: "wallpaper",
    label: "Wallpaper",
    hint: "Change your desktop wallpaper",
    icon: Wallpaper,
    keywords: ["wallpaper", "background", "desktop", "image", "theme"],
  },
]

type WindowAction = "minimize" | "maximize" | "close"

interface WindowCommand {
  action: WindowAction
  label: string
  hint: string
  icon: typeof Minimize2
  keywords: string[]
}

const WINDOW_COMMANDS: WindowCommand[] = [
  { action: "minimize", label: "Minimize this window", hint: "Minimize the window you were just using", icon: Minimize2, keywords: ["minimize", "min", "hide window"] },
  { action: "maximize", label: "Maximize this window", hint: "Make the window you were just using full screen", icon: Maximize2, keywords: ["maximize", "max", "fullscreen", "full screen"] },
  { action: "close", label: "Close this window", hint: "Close the window you were just using", icon: X, keywords: ["close", "close window", "quit", "exit"] },
]

const ALPINE_SETTINGS_ID = -1
const ALPINE_SETTINGS_PATH = "alpine:settings"
const ALPINE_SETTINGS_KEYWORDS = ["settings", "preferences", "options", "config", "system"]
const ALPINE_SETTINGS_ITEM: LauncherItem = {
  id: ALPINE_SETTINGS_ID,
  name: "Settings",
  lnkPath: "",
  target: ALPINE_SETTINGS_PATH,
  icon: null,
}

interface ContextAction {
  label: string
  icon: typeof ShieldCheck
  action: () => void
}

function appActions(item: LauncherItem, onUninstall: (item: LauncherItem) => void): ContextAction[] {
  const actions: ContextAction[] = [
    { label: "Run as administrator", icon: ShieldCheck, action: () => window.launcher.launchAdmin(item.id) },
  ]
  if (item.lnkPath) {
    actions.push({ label: "Open file location", icon: FolderOpen, action: () => window.launcher.openLocation(item.id) })
  }
  actions.push({ label: "Uninstall", icon: Trash2, action: () => onUninstall(item) })
  return actions
}

function openAppActions(app: OpenApp): ContextAction[] {
  if (app.path === ALPINE_SETTINGS_PATH) {
    return [{ label: "Close window", icon: X, action: () => window.shell.windows.closeSettings() }]
  }
  return [
    { label: "Close window", icon: X, action: () => window.launcher.closeWindow(app.hwnd) },
    { label: "End task", icon: SkullIcon, action: () => window.launcher.endTask(app.id) },
  ]
}

function runActions(query: string, run: RunResult): ContextAction[] {
  if (run.runInTerminal) {
    return [{ label: "Run without terminal", icon: Play, action: () => { window.shell.run.exec(query); window.launcher.hide() } }]
  }
  return [{ label: "Run in terminal", icon: Terminal, action: () => { window.shell.run.execTerminal(query); window.launcher.hide() } }]
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
  const [notice, setNotice] = useState<{ text: string; busy: boolean } | null>(null)
  const [activeCommand, setActiveCommand] = useState<SettingId | null>(null)
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const currentWallpaper = useWallpaper()
  const originalPath = useRef<string | null>(null)
  const committed = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const cornerLeftRef = useRef<HTMLDivElement>(null)
  const cornerRightRef = useRef<HTMLDivElement>(null)

  useFlyUnderBar(bodyRef, [cornerLeftRef, cornerRightRef], CORNER, true, closing)

  const sortedWallpapers = useMemo(() => {
    if (!query.trim()) return wallpapers
    return wallpapers
      .map((w) => ({ w, s: score(query, w.name) }))
      .sort((a, b) => b.s - a.s)
      .map((r) => r.w)
  }, [wallpapers, query])

  const panelWidth = activeCommand === "wallpaper"
    ? (wallpapers.length === 0 ? LAUNCHER_WIDTH_DEFAULT : wallpaperPanelWidth(wallpapers.length))
    : LAUNCHER_WIDTH_DEFAULT

  function enterCommand(id: SettingId) {
    setActiveCommand(id)
    setQuery("")
    setSelected(0)
    setContextOpen(false)
    if (id === "wallpaper") {
      committed.current = false
      const cur = wallpapers.find((w) => w.url === currentWallpaper)
      if (cur) {
        originalPath.current = cur.path
        setPreviewIndex(wallpapers.indexOf(cur))
      } else {
        originalPath.current = null
        setPreviewIndex(0)
      }
    }
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function commitWallpaper() {
    committed.current = true
    window.launcher.hide()
  }

  function exitCommand() {
    if (activeCommand === "wallpaper" && !committed.current && originalPath.current) {
      window.shell.windows.setWallpaper(originalPath.current)
    }
    originalPath.current = null
    committed.current = false
    setActiveCommand(null)
    setQuery("")
    setPreviewIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function navigatePreview(delta: number) {
    if (sortedWallpapers.length === 0) return
    setPreviewIndex((i) => (i + delta + sortedWallpapers.length) % sortedWallpapers.length)
  }

  function pickWallpaper(idx: number) {
    setPreviewIndex(idx)
    committed.current = true
    window.launcher.hide()
  }

  useEffect(() => {
    window.shell.apps.catalog().then(setItems)
    window.shell.apps.onCatalogChanged(setItems)
    window.shell.windows.openApps().then(setOpenApps)
    window.shell.windows.onOpenAppsChanged(setOpenApps)
    Promise.all([
      window.shell.windows.wallpaperMine(),
      window.shell.windows.wallpaperPresets(),
    ]).then(([mine, presets]) => {
      const list: WallpaperItem[] = [...mine, ...presets].map(({ name, path, thumbnail, url }) => ({ name, path, thumbnail, url }))
      setWallpapers(list)
    })
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    const left = Math.round((window.innerWidth - panelWidth) / 2) - CORNER
    const right = left + panelWidth + CORNER * 2
    onGapChange({ left, right })
  }, [panelWidth])

  useEffect(() => () => onGapChange(null), [])

  useEffect(() => {
    const onStartClose = () => setClosing(true)
    const onHide = () => { setClosing(false); setNotice(null) }
    window.launcher.onStartClose(onStartClose)
    window.launcher.onHide(onHide)
  }, [])

  useEffect(() => {
    const onBlur = () => { if (!notice) window.launcher.hide() }
    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [notice])

  const mathResult = useMemo(() => tryMath(query.trim()), [query])
  const mapResult = useAddressLookup(query)
  const runResult = useRunCommand(activeCommand ? "" : query)

  const matchedOpenApps = useMemo(() => {
    if (!query.trim()) return []
    const matched: { app: OpenApp; s: number }[] = []
    for (const app of openApps) {
      const nameScore = score(query, app.name)
      const titleScore = app.path.toLowerCase() === ALPINE_SETTINGS_PATH ? -1 : score(query, app.title)
      const best = Math.max(nameScore, titleScore)
      if (best >= 0) matched.push({ app, s: best })
    }
    matched.sort((a, b) => b.s - a.s)
    return matched.slice(0, 3).map((r) => r.app)
  }, [query, openApps])

  const matchedSettings = useMemo(() => {
    if (!query.trim()) return []
    const out: { setting: SettingCommand; s: number }[] = []
    for (const setting of SETTINGS) {
      let best = score(query, setting.label)
      for (const k of setting.keywords) best = Math.max(best, score(query, k))
      if (best >= 0) out.push({ setting, s: best })
    }
    out.sort((a, b) => b.s - a.s)
    return out.map((r) => r.setting)
  }, [query])

  const matchedWindowCommands = useMemo(() => {
    if (!query.trim()) return []
    const out: { cmd: WindowCommand; s: number }[] = []
    for (const cmd of WINDOW_COMMANDS) {
      let best = score(query, cmd.label)
      for (const k of cmd.keywords) best = Math.max(best, score(query, k))
      if (best >= 0) out.push({ cmd, s: best })
    }
    out.sort((a, b) => b.s - a.s)
    return out.map((r) => r.cmd)
  }, [query])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const openPaths = new Set(matchedOpenApps.map((a) => a.path.toLowerCase()))
    const openNames = new Set(matchedOpenApps.map((a) => a.name.toLowerCase()))
    const scored: { item: LauncherItem; s: number }[] = []
    for (const item of items) {
      if (openPaths.has(item.target.toLowerCase())) continue
      if (openNames.has(item.name.toLowerCase())) continue
      const s = score(query, item.name)
      if (s >= 0) scored.push({ item, s })
    }
    scored.sort((a, b) => b.s - a.s)
    const settingsScore = ALPINE_SETTINGS_KEYWORDS.reduce((m, k) => Math.max(m, score(query, k)), -1)
    const settingsAlreadyOpen = matchedOpenApps.some((a) => a.path.toLowerCase() === ALPINE_SETTINGS_PATH)
    const showSettings = settingsScore >= 0 && !settingsAlreadyOpen
    const taken = (mathResult ? 1 : 0) + (mapResult ? 1 : 0) + (runResult ? 1 : 0) + matchedOpenApps.length + matchedSettings.length + matchedWindowCommands.length + (showSettings ? 1 : 0)
    const limit = Math.max(1, MAX_RESULTS - taken)
    const list = scored.slice(0, limit).map((r) => r.item)
    if (showSettings) list.push(ALPINE_SETTINGS_ITEM)
    return list
  }, [query, items, mathResult, mapResult, runResult, matchedOpenApps, matchedSettings, matchedWindowCommands])

  const mathOffset = mathResult ? 1 : 0
  const mapOffset = mathOffset + (mapResult ? 1 : 0)
  const openOffset = mapOffset + matchedOpenApps.length
  const settingsOffset = openOffset + matchedSettings.length
  const winOffset = settingsOffset + matchedWindowCommands.length
  const runOffset = winOffset + results.length
  const totalCount = runOffset + (runResult ? 1 : 0)

  const selectedEntry = useMemo(() => {
    if (mathResult && selected === 0) return { type: "math" as const }
    if (mapResult && selected === mathOffset) return { type: "map" as const, result: mapResult }
    if (selected >= mapOffset && selected < openOffset) return { type: "open" as const, app: matchedOpenApps[selected - mapOffset] }
    if (selected >= openOffset && selected < settingsOffset) return { type: "setting" as const, setting: matchedSettings[selected - openOffset] }
    if (selected >= settingsOffset && selected < winOffset) return { type: "wincmd" as const, cmd: matchedWindowCommands[selected - settingsOffset] }
    if (selected >= winOffset && selected < runOffset) return { type: "app" as const, item: results[selected - winOffset] }
    if (runResult && selected === runOffset) return { type: "run" as const, run: runResult }
    return null
  }, [selected, mathResult, mapResult, runResult, matchedOpenApps, matchedSettings, matchedWindowCommands, results, mathOffset, mapOffset, openOffset, settingsOffset, winOffset, runOffset])

  async function runUninstall(item: LauncherItem) {
    setNotice({ text: `Removing ${item.name}…`, busy: true })
    const result = await window.launcher.uninstall(item.id)
    if (result.mode === "store") {
      setNotice({ text: result.ok ? `${item.name} removed` : `Couldn't remove ${item.name}`, busy: false })
      setTimeout(() => window.launcher.hide(), 1100)
    } else {
      window.launcher.hide()
    }
  }

  const contextActions = useMemo(() => {
    if (!contextOpen || !selectedEntry) return []
    if (selectedEntry.type === "app" && selectedEntry.item) return appActions(selectedEntry.item, runUninstall)
    if (selectedEntry.type === "open") return openAppActions(selectedEntry.app)
    if (selectedEntry.type === "run") return runActions(query, selectedEntry.run)
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextOpen, selectedEntry])

  useEffect(() => {
    if (selected >= totalCount) setSelected(0)
    setContextOpen(false)
  }, [results, mathResult, runResult])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (!query.trim() && !activeCommand && !notice) {
        setResultsHeight(0)
      } else if (resultsRef.current) {
        setResultsHeight(resultsRef.current.offsetHeight)
      }
    })
  }, [query, results, contextOpen, mapResult, activeCommand, notice])

  useEffect(() => {
    if (!resultsRef.current) return
    const observer = new ResizeObserver(() => {
      if (!resultsRef.current) return
      if (!query.trim() && !activeCommand) return
      setResultsHeight(resultsRef.current.offsetHeight)
    })
    observer.observe(resultsRef.current)
    return () => observer.disconnect()
  }, [query, activeCommand])

  useEffect(() => {
    if (activeCommand !== "wallpaper") return
    if (sortedWallpapers.length === 0) return
    const idx = Math.min(previewIndex, sortedWallpapers.length - 1)
    const target = sortedWallpapers[idx]
    if (target && target.url !== currentWallpaper) {
      window.shell.windows.setWallpaper(target.path)
    }
  }, [previewIndex, activeCommand, sortedWallpapers])

  useEffect(() => {
    if (activeCommand !== "wallpaper") return
    if (originalPath.current) return
    if (wallpapers.length === 0) return
    const cur = wallpapers.find((w) => w.url === currentWallpaper)
    if (cur) {
      originalPath.current = cur.path
      setPreviewIndex(wallpapers.indexOf(cur))
    }
  }, [wallpapers, activeCommand])

  useEffect(() => {
    return () => {
      if (originalPath.current && !committed.current) {
        window.shell.windows.setWallpaper(originalPath.current)
      }
    }
  }, [])

  function handleKey(e: React.KeyboardEvent) {
    if (notice) {
      if (e.key === "Escape") {
        e.preventDefault()
        window.launcher.hide()
      }
      return
    }
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
      if (activeCommand) exitCommand()
      else window.launcher.hide()
    } else if (e.key === "Backspace" && activeCommand && query === "") {
      e.preventDefault()
      exitCommand()
    } else if (activeCommand === "wallpaper") {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        navigatePreview(-1)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        navigatePreview(1)
      } else if (e.key === "Enter") {
        e.preventDefault()
        commitWallpaper()
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, totalCount - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === "ArrowRight" && selectedEntry && (
      selectedEntry.type === "open" ||
      selectedEntry.type === "run" ||
      (selectedEntry.type === "app" && selectedEntry.item && selectedEntry.item.id !== ALPINE_SETTINGS_ID)
    )) {
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
      } else if (selectedEntry.type === "setting" && selectedEntry.setting) {
        enterCommand(selectedEntry.setting.id)
      } else if (selectedEntry.type === "wincmd" && selectedEntry.cmd) {
        window.shell.apps.windowCommand(selectedEntry.cmd.action)
        window.launcher.hide()
      } else if (selectedEntry.type === "run" && selectedEntry.run) {
        if (selectedEntry.run.runInTerminal) window.shell.run.execTerminal(query)
        else window.shell.run.exec(query)
        window.launcher.hide()
      } else if (selectedEntry.type === "app" && selectedEntry.item) {
        if (selectedEntry.item.id === ALPINE_SETTINGS_ID) {
          window.shell.windows.openSettings()
          window.launcher.hide()
        } else {
          window.launcher.launch(selectedEntry.item.id)
        }
      }
    }
  }

  useEffect(() => {
    if (contextOpen) return
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [selected, contextOpen])

  const left = Math.round((window.innerWidth - panelWidth) / 2)

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
        className="absolute"
        style={{ top: 24, left, width: panelWidth, outline: "none", transition: WIDTH_TRANSITION, clipPath: "inset(0 -2000px -2000px -2000px)" }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={contextOpen ? handleKey : undefined}
        tabIndex={-1}
      >
        <div ref={cornerLeftRef} className="absolute top-0 right-full" style={{ width: CORNER, height: CORNER, background: cornerBg }} />
        <div ref={cornerRightRef} className="absolute top-0 left-full" style={{ width: CORNER, height: CORNER, background: cornerBgRight }} />
        <div ref={bodyRef} className="relative">
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
                  {selectedEntry.type === "app" ? selectedEntry.item?.name : selectedEntry.type === "open" ? selectedEntry.app.name : selectedEntry.type === "run" ? selectedEntry.run.display : ""}
                </span>
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (activeCommand === "wallpaper") setPreviewIndex(0)
                  }}
                  onKeyDown={handleKey}
                  placeholder={activeCommand === "wallpaper" ? "Filter wallpapers" : "Search apps"}
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
                {notice ? (
                  <>
                    <div className={`h-px w-full ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                    <div className="flex items-center gap-3 px-4 h-12">
                      {notice.busy && <Loader2 size={16} className={`shrink-0 animate-spin ${darkText ? "text-black/40" : "text-white/40"}`} />}
                      <span className={`text-[14px] ${textColor}`}>{notice.text}</span>
                    </div>
                  </>
                ) : activeCommand === "wallpaper" ? (
                  <>
                    <div className={`h-px w-full ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                    <WallpaperCarousel
                      wallpapers={sortedWallpapers}
                      loading={wallpapers.length === 0}
                      selectedIndex={previewIndex}
                      onPick={pickWallpaper}
                    />
                  </>
                ) : contextOpen && contextActions.length > 0 ? (
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
                      {matchedOpenApps.length > 0 && matchedSettings.length > 0 && (
                        <div className={`h-px mx-2 my-0.5 ${darkText ? "bg-black/5" : "bg-white/5"}`} />
                      )}
                      {matchedSettings.map((s, i) => {
                        const idx = openOffset + i
                        const Icon = s.icon
                        return (
                          <button
                            key={`setting-${s.id}`}
                            onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                            onClick={() => enterCommand(s.id)}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                              idx === selected ? selectedBg : hoverBg
                            }`}
                          >
                            <Icon size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className={`text-[13px] truncate ${textColor}`}>{s.label}</span>
                              <span className={`text-[11px] truncate ${dimText}`}>{s.hint}</span>
                            </div>
                            <Settings2 size={12} className={`shrink-0 ${darkText ? "text-black/25" : "text-white/25"}`} />
                          </button>
                        )
                      })}
                      {matchedWindowCommands.length > 0 && (matchedOpenApps.length > 0 || matchedSettings.length > 0) && (
                        <div className={`h-px mx-2 my-0.5 ${darkText ? "bg-black/5" : "bg-white/5"}`} />
                      )}
                      {matchedWindowCommands.map((cmd, i) => {
                        const idx = settingsOffset + i
                        const Icon = cmd.icon
                        return (
                          <button
                            key={`wincmd-${cmd.action}`}
                            onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                            onClick={() => { window.shell.apps.windowCommand(cmd.action); window.launcher.hide() }}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                              idx === selected ? selectedBg : hoverBg
                            }`}
                          >
                            <Icon size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className={`text-[13px] truncate ${textColor}`}>{cmd.label}</span>
                              <span className={`text-[11px] truncate ${dimText}`}>{cmd.hint}</span>
                            </div>
                          </button>
                        )
                      })}
                      {(matchedOpenApps.length > 0 || matchedSettings.length > 0 || matchedWindowCommands.length > 0) && results.length > 0 && (
                        <div className={`h-px mx-2 my-0.5 ${darkText ? "bg-black/5" : "bg-white/5"}`} />
                      )}
                      {results.map((item, i) => {
                        const idx = winOffset + i
                        const isAlpineSettings = item.id === ALPINE_SETTINGS_ID
                        return (
                          <button
                            key={item.id}
                            onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                            onClick={() => {
                              if (isAlpineSettings) {
                                window.shell.windows.openSettings()
                                window.launcher.hide()
                              } else {
                                window.launcher.launch(item.id)
                              }
                            }}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                              idx === selected ? selectedBg : hoverBg
                            }`}
                          >
                            {isAlpineSettings ? (
                              <img src={window.shell.settingsIcon} alt="" className="w-7 h-7 shrink-0" draggable={false} />
                            ) : item.icon ? (
                              <img src={item.icon} alt="" className="w-7 h-7 shrink-0" draggable={false} />
                            ) : (
                              <div className={`w-7 h-7 shrink-0 rounded ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                            )}
                            <span className={`text-[13px] truncate ${textColor}`}>{item.name}</span>
                          </button>
                        )
                      })}
                      {runResult && (winOffset > 0 || results.length > 0) && (
                        <div className={`h-px mx-2 my-0.5 ${darkText ? "bg-black/5" : "bg-white/5"}`} />
                      )}
                      {runResult && (() => {
                        const RunIcon = runResult.kind === "command" ? (runResult.runInTerminal ? Terminal : Play) : RUN_ICONS[runResult.kind]
                        return (
                          <button
                            onMouseMove={() => { setSelected(runOffset); setContextOpen(false) }}
                            onClick={() => { if (runResult.runInTerminal) window.shell.run.execTerminal(query); else window.shell.run.exec(query); window.launcher.hide() }}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${
                              runOffset === selected ? selectedBg : hoverBg
                            }`}
                          >
                            <RunIcon size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className={`text-[13px] truncate ${textColor}`}>{runResult.label}</span>
                              <span className={`text-[11px] truncate ${dimText}`}>{runResult.display}</span>
                            </div>
                          </button>
                        )
                      })()}
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

interface WallpaperItem {
  name: string
  path: string
  thumbnail: string
  url: string
}

interface WallpaperCarouselProps {
  wallpapers: WallpaperItem[]
  loading: boolean
  selectedIndex: number
  onPick: (idx: number) => void
}

function WallpaperCarousel({ wallpapers, loading, selectedIndex, onPick }: WallpaperCarouselProps) {
  const darkText = useDarkText()
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const didCenter = useRef(false)

  const dimText = darkText ? "text-black/55" : "text-white/55"
  const selectedBorder = darkText ? "border-black" : "border-white"
  const defaultBorder = darkText ? "border-black/10 hover:border-black/30" : "border-white/10 hover:border-white/30"

  useEffect(() => {
    if (!selectedRef.current || !scrollRef.current) return
    const el = selectedRef.current
    const container = scrollRef.current
    const target = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2
    container.scrollTo({ left: target, behavior: didCenter.current ? "smooth" : "auto" })
    didCenter.current = true
  }, [selectedIndex, wallpapers])

  if (loading) {
    return <div className={`px-4 py-6 text-[13px] ${dimText}`}>Loading wallpapers…</div>
  }

  if (wallpapers.length === 0) {
    return <div className={`px-4 py-6 text-[13px] ${dimText}`}>No wallpapers</div>
  }

  return (
    <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-3 px-4 py-4 w-max">
        {wallpapers.map((w, i) => {
          const selected = i === selectedIndex
          return (
            <button
              key={w.path}
              ref={selected ? selectedRef : undefined}
              onClick={() => onPick(i)}
              className="shrink-0 cursor-pointer"
              style={{ width: WALLPAPER_TILE_WIDTH }}
            >
              <div
                className={`relative w-full aspect-video rounded-lg overflow-hidden bg-neutral-900 border-2 transition-colors ${
                  selected ? selectedBorder : defaultBorder
                }`}
              >
                <img src={w.thumbnail} alt="" className="w-full h-full object-cover" draggable={false} />
                <div className="absolute left-0 right-0 bottom-0 px-2 py-1 bg-linear-to-t from-black/70 to-transparent">
                  <span className="text-[11px] text-white truncate block text-left">{w.name}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

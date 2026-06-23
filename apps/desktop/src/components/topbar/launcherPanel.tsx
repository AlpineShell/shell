import { createPortal } from "react-dom"
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Search, ChevronLeft, ChevronRight, ShieldCheck, FolderOpen, Trash2, Equal, Copy, X, SkullIcon, MapPin, Minimize2, Maximize2, Loader2, Terminal, Globe, FileText, Play, Wifi, WifiHigh, WifiLow, WifiZero, WifiOff, Lock, Bluetooth, BluetoothConnected, LayoutDashboard, LayoutGrid, Monitor, ChevronUp, RotateCcw, Power, LogOut, type LucideIcon } from "lucide-react"
import { useDarkText, useFullscreenWindow } from "../themeContext"
import { useWallpaper } from "../../hooks/useWallpaper"
import { useMonitors } from "../../hooks/useMonitors"
import { RADIUS } from "./chrome/chromeShape"
import { setChromeSurface, clearChromeSurface, nextSurfaceId } from "./chrome/chromeStore"
import { SETTING_COMMANDS, type SettingCommand } from "./launcherSettings"
import { scoreField, scoreItem, deriveFields, frecencyKey, frecencyBoost, type SearchFields } from "../../lib/launcherSearch"
import { useFrecencyScores } from "../../hooks/useFrecencyScores"
import { useLauncherRecentApps } from "../../hooks/useLauncherRecentApps"

const BAR_BOTTOM = 24
const MAX_RESULTS = 5
const EMPTY_RESULTS = 6
const LAUNCHER_WIDTH_DEFAULT = 600
const WALLPAPER_TILE_WIDTH = 200
const WALLPAPER_TILE_GAP = 12
const WALLPAPER_PANEL_PADDING_X = 16
const WALLPAPER_MAX_VISIBLE = 5

function wallpaperPanelWidth(visibleCount: number): number {
  if (visibleCount <= 0) return LAUNCHER_WIDTH_DEFAULT
  const tiles = Math.min(visibleCount, WALLPAPER_MAX_VISIBLE)
  return tiles * WALLPAPER_TILE_WIDTH + (tiles - 1) * WALLPAPER_TILE_GAP + WALLPAPER_PANEL_PADDING_X * 2
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

function staticMapUrl(lat: number, lon: number): string {
  const zoom = 15
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom))
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom))
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

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

export default function LauncherPanel() {
  const darkText = useDarkText()
  const outline = useFullscreenWindow()
  const textColor = darkText ? "text-black" : "text-white"
  const dimText = darkText ? "text-black/50" : "text-white/50"
  const hoverBg = darkText ? "hover:bg-black/5" : "hover:bg-white/5"
  const selectedBg = darkText ? "bg-black/10" : "bg-white/10"
  const placeholderColor = darkText ? "placeholder:text-black/40" : "placeholder:text-white/40"

  const [items, setItems] = useState<LauncherItem[]>([])
  const [openApps, setOpenApps] = useState<OpenApp[]>([])
  const scores = useFrecencyScores()
  const showRecentApps = useLauncherRecentApps()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [contextOpen, setContextOpen] = useState(false)
  const [contextSelected, setContextSelected] = useState(0)
  const [notice, setNotice] = useState<{ text: string; busy: boolean } | null>(null)
  const [activeCommand, setActiveCommand] = useState<string | null>(null)
  const [settingValues, setSettingValues] = useState<Record<string, boolean | number>>({})
  const [subView, setSubView] = useState<{ title: string; back: () => void } | null>(null)
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const currentWallpaper = useWallpaper()
  const { monitors, setBrightness } = useMonitors()
  const brightnessIsSubmenu = monitors.length > 1
  const originalPath = useRef<string | null>(null)
  const committed = useRef(false)
  const queryBeforeCommand = useRef("")
  const selectedBeforeCommand = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)
  if (!idRef.current) idRef.current = nextSurfaceId()
  const firstRef = useRef(true)

  const sortedWallpapers = useMemo(() => {
    const q = query.trim()
    if (!q) return wallpapers
    return wallpapers
      .map((w) => ({ w, s: scoreField(q, w.name) }))
      .sort((a, b) => b.s - a.s)
      .map((r) => r.w)
  }, [wallpapers, query])

  const fieldsById = useMemo(() => {
    const map = new Map<number, SearchFields>()
    for (const item of items) map.set(item.id, deriveFields(item))
    return map
  }, [items])

  const panelWidth = activeCommand === "wallpaper"
    ? Math.max(LAUNCHER_WIDTH_DEFAULT, wallpaperPanelWidth(wallpapers.length))
    : LAUNCHER_WIDTH_DEFAULT
  const inSubmenu = !!activeCommand && activeCommand !== "wallpaper"
  const activeLabel = activeCommand ? (SETTING_COMMANDS.find((c) => c.id === activeCommand)?.label ?? "") : ""

  function enterCommand(id: string) {
    queryBeforeCommand.current = query
    selectedBeforeCommand.current = selected
    setActiveCommand(id)
    setSelected(0)
    setContextOpen(false)
    setSubView(null)
    if (id === "wallpaper") {
      setQuery("")
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
    setSubView(null)
    setQuery(queryBeforeCommand.current)
    setSelected(selectedBeforeCommand.current)
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

  const loadSettingValues = useCallback(() => {
    for (const cmd of SETTING_COMMANDS) {
      const c = cmd.control
      if (c.kind === "toggle" || c.kind === "slider") {
        c.get().then((v) => setSettingValues((prev) => ({ ...prev, [cmd.id]: v }))).catch(() => {})
      }
    }
  }, [])

  function toggleSetting(cmd: SettingCommand) {
    if (cmd.control.kind !== "toggle") return
    const current = settingValues[cmd.id] === true
    const next = !current
    setSettingValues((prev) => ({ ...prev, [cmd.id]: next }))
    Promise.resolve(cmd.control.set(next)).catch(() => setSettingValues((prev) => ({ ...prev, [cmd.id]: current })))
  }

  function adjustSetting(cmd: SettingCommand, direction: number) {
    if (cmd.control.kind === "brightness") {
      const m = monitors[0]
      const current = m ? m.brightness : 50
      const next = Math.max(0, Math.min(100, current + direction * 5))
      if (next === current) return
      if (m) setBrightness(m.id, next)
      else window.shell.system.setBrightness(next)
      return
    }
    if (cmd.control.kind !== "slider") return
    const c = cmd.control
    const current = typeof settingValues[cmd.id] === "number" ? (settingValues[cmd.id] as number) : c.min
    const next = Math.max(c.min, Math.min(c.max, current + direction * c.step))
    if (next === current) return
    setSettingValues((prev) => ({ ...prev, [cmd.id]: next }))
    Promise.resolve(c.set(next)).catch(() => {})
  }

  function setSliderValue(cmd: SettingCommand, value: number) {
    if (cmd.control.kind !== "slider") return
    setSettingValues((prev) => ({ ...prev, [cmd.id]: value }))
    Promise.resolve(cmd.control.set(value)).catch(() => {})
  }

  function activateSetting(cmd: SettingCommand) {
    const c = cmd.control
    if (c.kind === "brightness") { if (brightnessIsSubmenu) enterCommand(cmd.id) }
    else if (c.kind === "wallpaper" || c.kind === "wifi" || c.kind === "bluetooth" || c.kind === "tiling" || c.kind === "startup" || c.kind === "power" || c.kind === "tray") enterCommand(cmd.id)
    else if (c.kind === "toggle") toggleSetting(cmd)
    else if (c.kind === "navigate") {
      window.shell.windows.openSettings(c.path)
      window.launcher.hide()
    }
  }

  useEffect(() => {
    window.shell.apps.catalog().then(setItems)
    const offCatalog = window.shell.apps.onCatalogChanged(setItems)
    window.shell.windows.openApps().then(setOpenApps)
    const offOpenApps = window.shell.windows.onOpenAppsChanged(setOpenApps)
    Promise.all([
      window.shell.windows.wallpaperMine(),
      window.shell.windows.wallpaperPresets(),
    ]).then(([mine, presets]) => {
      const list: WallpaperItem[] = [...mine, ...presets].map(({ name, path, thumbnail, url }) => ({ name, path, thumbnail, url }))
      setWallpapers(list)
    })
    loadSettingValues()
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      offCatalog()
      offOpenApps()
    }
  }, [loadSettingValues])

  function registerSurface() {
    const body = bodyRef.current
    const panel = panelRef.current
    if (!body || !panel) return
    const h = Math.round(body.getBoundingClientRect().height)
    if (firstRef.current) {
      panel.style.height = `${h}px`
      panel.style.clipPath = `inset(0 0 ${h}px 0 round 0 0 ${RADIUS}px ${RADIUS}px)`
      firstRef.current = false
    }
    setChromeSurface({
      id: idRef.current,
      centerX: Math.round(window.innerWidth / 2),
      bodyWidth: panelWidth,
      fullHeight: h,
      outline,
      anchor: "center",
      contentEl: panel,
    })
  }

  useLayoutEffect(() => {
    registerSurface()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelWidth, outline])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const sync = () => registerSurface()
    const observer = new ResizeObserver(sync)
    observer.observe(body)
    window.addEventListener("resize", sync)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelWidth, outline])

  useEffect(() => () => clearChromeSurface(idRef.current), [])

  useEffect(() => {
    const offStartClose = window.launcher.onStartClose(() => clearChromeSurface(idRef.current))
    const offHide = window.launcher.onHide(() => setNotice(null))
    return () => {
      offStartClose()
      offHide()
    }
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
    const q = query.trim()
    if (!q) return []
    const matched: { app: OpenApp; s: number }[] = []
    for (const app of openApps) {
      const nameScore = scoreField(q, app.name)
      const titleScore = app.path.toLowerCase() === ALPINE_SETTINGS_PATH ? -1 : scoreField(q, app.title)
      const best = Math.max(nameScore, titleScore)
      if (best >= 0) matched.push({ app, s: best })
    }
    matched.sort((a, b) => b.s - a.s)
    return matched.slice(0, 3).map((r) => r.app)
  }, [query, openApps])

  const matchedSettings = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const out: { setting: SettingCommand; s: number }[] = []
    for (const setting of SETTING_COMMANDS) {
      let best = scoreField(q, setting.label)
      for (const k of setting.keywords) best = Math.max(best, scoreField(q, k))
      if (best >= 0) out.push({ setting, s: best })
    }
    out.sort((a, b) => b.s - a.s)
    return out.slice(0, 5).map((r) => r.setting)
  }, [query])

  const matchedWindowCommands = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const out: { cmd: WindowCommand; s: number }[] = []
    for (const cmd of WINDOW_COMMANDS) {
      let best = scoreField(q, cmd.label)
      for (const k of cmd.keywords) best = Math.max(best, scoreField(q, k))
      if (best >= 0) out.push({ cmd, s: best })
    }
    out.sort((a, b) => b.s - a.s)
    return out.map((r) => r.cmd)
  }, [query])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) {
      if (!showRecentApps) return []
      return items
        .map((item) => ({ item, f: scores[frecencyKey(item.target)] ?? 0 }))
        .filter((entry) => entry.f > 0)
        .sort((a, b) => b.f - a.f)
        .slice(0, EMPTY_RESULTS)
        .map((entry) => entry.item)
    }
    const openPaths = new Set(matchedOpenApps.map((a) => a.path.toLowerCase()))
    const openNames = new Set(matchedOpenApps.map((a) => a.name.toLowerCase()))
    const scored: { item: LauncherItem; s: number }[] = []
    for (const item of items) {
      if (openPaths.has(item.target.toLowerCase())) continue
      if (openNames.has(item.name.toLowerCase())) continue
      const fields = fieldsById.get(item.id)
      if (!fields) continue
      const base = scoreItem(q, fields)
      if (base < 0) continue
      scored.push({ item, s: base + frecencyBoost(scores[frecencyKey(item.target)] ?? 0) })
    }
    scored.sort((a, b) => b.s - a.s)
    const settingsScore = ALPINE_SETTINGS_KEYWORDS.reduce((m, k) => Math.max(m, scoreField(q, k)), -1)
    const settingsAlreadyOpen = matchedOpenApps.some((a) => a.path.toLowerCase() === ALPINE_SETTINGS_PATH)
    const showSettings = settingsScore >= 0 && !settingsAlreadyOpen
    const taken = (mathResult ? 1 : 0) + (mapResult ? 1 : 0) + (runResult ? 1 : 0) + matchedOpenApps.length + matchedSettings.length + matchedWindowCommands.length + (showSettings ? 1 : 0)
    const limit = Math.max(1, MAX_RESULTS - taken)
    const list = scored.slice(0, limit).map((r) => r.item)
    if (showSettings) list.push(ALPINE_SETTINGS_ITEM)
    return list
  }, [query, items, fieldsById, scores, showRecentApps, mathResult, mapResult, runResult, matchedOpenApps, matchedSettings, matchedWindowCommands])

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
    } else if (selectedEntry && selectedEntry.type === "setting" && (selectedEntry.setting.control.kind === "slider" || (selectedEntry.setting.control.kind === "brightness" && !brightnessIsSubmenu)) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault()
      adjustSetting(selectedEntry.setting, e.key === "ArrowRight" ? 1 : -1)
    } else if (e.key === "ArrowRight" && selectedEntry && selectedEntry.type === "setting" && selectedEntry.setting.control.kind !== "toggle") {
      e.preventDefault()
      activateSetting(selectedEntry.setting)
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
        activateSetting(selectedEntry.setting)
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

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onMouseDown={() => window.launcher.hide()}
    >
      <div
        ref={panelRef}
        className="absolute"
        style={{ top: BAR_BOTTOM, left: "50%", width: panelWidth, transform: "translateX(-50%)", outline: "none", overflow: "hidden", borderRadius: `0 0 ${RADIUS}px ${RADIUS}px`, willChange: "clip-path" }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={contextOpen ? handleKey : undefined}
        tabIndex={-1}
      >
        <div ref={bodyRef} className="flex flex-col">
          <div className={`flex items-center gap-2 px-4 h-12 shrink-0 ${textColor}`}>
              {activeCommand || contextOpen ? (
                <button
                  onMouseDown={(e) => { e.preventDefault(); if (subView) subView.back(); else if (activeCommand) exitCommand(); else { setContextOpen(false); requestAnimationFrame(() => inputRef.current?.focus()) } }}
                  className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
              ) : (
                <Search size={16} className="shrink-0 opacity-60" />
              )}
              {inSubmenu ? (
                <span className={`flex-1 text-[15px] truncate ${textColor}`}>{subView ? subView.title : activeLabel}</span>
              ) : contextOpen && selectedEntry ? (
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
            <div>
                {inSubmenu ? (
                  <>
                    <div className={`h-px w-full ${darkText ? "bg-black/10" : "bg-white/10"}`} />
                    {activeCommand === "wifi" ? (
                      <LauncherWifi darkText={darkText} onBack={exitCommand} />
                    ) : activeCommand === "bluetooth" ? (
                      <LauncherBluetooth darkText={darkText} onBack={exitCommand} />
                    ) : activeCommand === "tiling" ? (
                      <LauncherTiling darkText={darkText} onBack={exitCommand} />
                    ) : activeCommand === "startup" ? (
                      <LauncherStartup darkText={darkText} onBack={exitCommand} />
                    ) : activeCommand === "tray" ? (
                      <LauncherTray darkText={darkText} onBack={exitCommand} onSubView={setSubView} />
                    ) : activeCommand === "brightness" ? (
                      <LauncherBrightness darkText={darkText} onBack={exitCommand} monitors={monitors} setBrightness={setBrightness} />
                    ) : (
                      <LauncherPower darkText={darkText} onBack={exitCommand} />
                    )}
                  </>
                ) : notice ? (
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
                ) : totalCount > 0 ? (
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
                                src={staticMapUrl(mapResult.lat, mapResult.lon)}
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
                        const isSel = idx === selected
                        const control = s.control
                        if (control.kind === "brightness" && !brightnessIsSubmenu) {
                          const m = monitors[0]
                          const value = m ? m.brightness : 50
                          return (
                            <div
                              key={`setting-${s.id}`}
                              onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                              className={`flex items-center gap-3 px-2.5 h-12 rounded-md transition-colors ${isSel ? selectedBg : hoverBg}`}
                            >
                              <Icon size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                              <input
                                type="range"
                                tabIndex={-1}
                                min={0}
                                max={100}
                                step={5}
                                value={value}
                                onChange={(e) => { const v = parseInt(e.target.value, 10); if (m) setBrightness(m.id, v); else window.shell.system.setBrightness(v) }}
                                onMouseUp={() => requestAnimationFrame(() => inputRef.current?.focus())}
                                className={`cc-slider animate flex-1 ${darkText ? "cc-slider-light" : ""}`}
                                style={{ "--slider-progress": `${value}%` } as React.CSSProperties}
                              />
                              <span className={`shrink-0 text-[12px] tabular-nums ${dimText}`}>{value}%</span>
                            </div>
                          )
                        }
                        if (control.kind === "slider") {
                          const value = typeof settingValues[s.id] === "number" ? (settingValues[s.id] as number) : control.min
                          return (
                            <div
                              key={`setting-${s.id}`}
                              onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                              className={`flex items-center gap-3 px-2.5 h-12 rounded-md transition-colors ${isSel ? selectedBg : hoverBg}`}
                            >
                              <Icon size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                              <input
                                type="range"
                                tabIndex={-1}
                                min={control.min}
                                max={control.max}
                                step={control.step}
                                value={value}
                                onChange={(e) => setSliderValue(s, parseInt(e.target.value, 10))}
                                onMouseUp={() => requestAnimationFrame(() => inputRef.current?.focus())}
                                className={`cc-slider animate flex-1 ${darkText ? "cc-slider-light" : ""}`}
                                style={{ "--slider-progress": `${((value - control.min) / (control.max - control.min)) * 100}%` } as React.CSSProperties}
                              />
                              <span className={`shrink-0 text-[12px] tabular-nums ${dimText}`}>{value}{control.unit ?? ""}</span>
                            </div>
                          )
                        }
                        const on = settingValues[s.id] === true
                        return (
                          <button
                            key={`setting-${s.id}`}
                            onMouseMove={() => { setSelected(idx); setContextOpen(false) }}
                            onClick={() => activateSetting(s)}
                            className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${isSel ? selectedBg : hoverBg}`}
                          >
                            <Icon size={18} className={`w-7 shrink-0 ${darkText ? "text-black/40" : "text-white/40"}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className={`text-[13px] truncate ${textColor}`}>{s.label}</span>
                              <span className={`text-[11px] truncate ${dimText}`}>{s.hint}</span>
                            </div>
                            {control.kind === "toggle" ? (
                              <span
                                className="relative shrink-0 rounded-full transition-colors"
                                style={{ width: 32, height: 18, backgroundColor: on ? (darkText ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)") : (darkText ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.18)") }}
                              >
                                <span className="absolute top-0.5 rounded-full transition-all" style={{ width: 14, height: 14, left: on ? 16 : 2, backgroundColor: on ? (darkText ? "rgb(255,255,255)" : "rgb(20,20,20)") : (darkText ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)") }} />
                              </span>
                            ) : (
                              <ChevronRight size={14} className={`shrink-0 ${darkText ? "text-black/25" : "text-white/25"}`} />
                            )}
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

function WifiSignalIcon({ signal, color, size }: { signal: number; color: string; size: number }) {
  if (signal >= 70) return <Wifi color={color} size={size} />
  if (signal >= 40) return <WifiHigh color={color} size={size} />
  if (signal >= 10) return <WifiLow color={color} size={size} />
  return <WifiZero color={color} size={size} />
}

function SubToggle({ on, darkText }: { on: boolean; darkText: boolean }) {
  return (
    <span className="relative shrink-0 rounded-full transition-colors" style={{ width: 32, height: 18, backgroundColor: on ? (darkText ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)") : (darkText ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.18)") }}>
      <span className="absolute top-0.5 rounded-full transition-all" style={{ width: 14, height: 14, left: on ? 16 : 2, backgroundColor: on ? (darkText ? "rgb(255,255,255)" : "rgb(20,20,20)") : (darkText ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)") }} />
    </span>
  )
}

function LauncherWifi({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const textColor = darkText ? "text-black" : "text-white"
  const dimText = darkText ? "text-black/50" : "text-white/50"
  const selectedBg = darkText ? "bg-black/10" : "bg-white/10"
  const iconColor = darkText ? "black" : "white"
  const iconDim = darkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)"

  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [enabled, setEnabled] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState(0)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const pwRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const itemCount = 1 + (enabled ? networks.length : 0)

  const scan = useCallback(async () => {
    setScanning(true)
    try { const r = await window.shell.network.wifiScan(); if (r) setNetworks(r) } finally { setScanning(false) }
  }, [])

  useEffect(() => {
    window.shell.network.wifiRadioGet().then((r) => setEnabled(typeof r?.state === "string" && r.state.toLowerCase() === "on")).catch(() => {})
    window.shell.network.wifiNetworks().then(setNetworks).catch(() => {})
    const off = window.shell.network.onWifiScanUpdated((data) => { setNetworks(data); setScanning(false) })
    scan()
    return () => off()
  }, [scan])

  useEffect(() => {
    if (selected > itemCount - 1) setSelected(Math.max(0, itemCount - 1))
  }, [itemCount, selected])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [selected])

  function toggleRadio() {
    const next = !enabled
    setEnabled(next)
    setSelected(0)
    window.shell.network.wifiRadioSet(next).then(() => { if (next) scan() }).catch(() => {})
  }

  async function connect(network: WifiNetwork, pwd?: string) {
    setConnecting(network.ssid)
    setError(false)
    const result = await window.shell.network.wifiConnect(network.ssid, pwd)
    if (result.needsPassword && !pwd) {
      setConnecting(null)
      setPasswordFor(network.ssid)
      setPassword("")
      requestAnimationFrame(() => pwRef.current?.focus())
      return
    }
    setConnecting(null)
    if (!result.success) { setError(true); return }
    setPasswordFor(null)
    setPassword("")
    setTimeout(scan, 1200)
  }

  function activateNetwork(network: WifiNetwork) {
    if (connecting) return
    if (network.connected) { window.shell.network.wifiDisconnect().then(() => setTimeout(scan, 800)); return }
    if (passwordFor === network.ssid) { setPasswordFor(null); setPassword(""); return }
    connect(network)
  }

  function activate(idx: number) {
    if (idx === 0) { toggleRadio(); return }
    const network = networks[idx - 1]
    if (network) activateNetwork(network)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (passwordFor) return
      if (e.key === "Escape" || e.key === "Backspace" || e.key === "ArrowLeft") { e.preventDefault(); onBack() }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, itemCount - 1)) }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
      else if (e.key === "Enter") { e.preventDefault(); activate(selected) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div ref={listRef} className="flex flex-col p-1.5 gap-0.5 max-h-[60vh] overflow-y-auto">
      <button
        data-idx={0}
        onMouseMove={() => setSelected(0)}
        onClick={toggleRadio}
        className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${selected === 0 ? selectedBg : ""}`}
      >
        <Wifi size={18} className={`w-7 shrink-0 ${dimText}`} />
        <span className={`flex-1 text-[13px] ${textColor}`}>Wi-Fi</span>
        <SubToggle on={enabled} darkText={darkText} />
      </button>

      {enabled && <div className={`h-px my-1 ${darkText ? "bg-black/10" : "bg-white/10"}`} />}

      {!enabled ? null : scanning && networks.length === 0 ? (
        <div className={`flex items-center justify-center py-4 ${dimText}`}><Loader2 size={18} className="animate-spin" /></div>
      ) : networks.length === 0 ? (
        <div className={`flex items-center gap-2 justify-center py-4 text-[13px] ${dimText}`}><WifiOff size={15} /><span>No networks</span></div>
      ) : (
        networks.map((network, i) => {
          const idx = i + 1
          return (
            <div key={network.ssid}>
              <button
                data-idx={idx}
                onMouseMove={() => setSelected(idx)}
                onClick={() => activateNetwork(network)}
                className={`w-full flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${idx === selected ? selectedBg : ""}`}
              >
                <span className="w-7 shrink-0 flex justify-center">
                  <WifiSignalIcon signal={network.signal} color={network.connected ? iconColor : iconDim} size={16} />
                </span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-[13px] truncate ${textColor}`}>{network.ssid}</span>
                  {network.connected && <span className={`text-[11px] ${dimText}`}>Connected</span>}
                </div>
                {connecting === network.ssid && <Loader2 size={13} className={`shrink-0 animate-spin ${dimText}`} />}
                {network.security !== "Open" && <Lock size={12} className={`shrink-0 ${dimText}`} />}
              </button>
              {passwordFor === network.ssid && (
                <div className="flex gap-2 px-2.5 py-1.5 items-center">
                  <input
                    ref={pwRef}
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(false) }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === "Enter") { if (password.trim()) connect(network, password) }
                      else if (e.key === "Escape") { setPasswordFor(null); setPassword("") }
                    }}
                    placeholder="Password"
                    autoFocus
                    className={`flex-1 text-[13px] px-2 py-1 rounded-md outline-none ${darkText ? "bg-black/5 text-black placeholder:text-black/30" : "bg-white/10 text-white placeholder:text-white/30"} ${error ? "ring-1 ring-red-400" : ""}`}
                  />
                  <button onClick={() => { if (password.trim()) connect(network, password) }} className={`text-[12px] px-2 py-1 rounded-md cursor-pointer ${darkText ? "bg-black/10 text-black" : "bg-white/15 text-white"}`}>Join</button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function LauncherBluetooth({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const textColor = darkText ? "text-black" : "text-white"
  const dimText = darkText ? "text-black/50" : "text-white/50"
  const selectedBg = darkText ? "bg-black/10" : "bg-white/10"
  const iconColor = darkText ? "black" : "white"
  const iconDim = darkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)"

  const [devices, setDevices] = useState<BluetoothDevice[]>([])
  const [enabled, setEnabled] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState(0)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const itemCount = 1 + (enabled ? devices.length : 0)

  const scan = useCallback(async () => {
    setScanning(true)
    try { const r = await window.shell.system.bluetoothScan(); if (r) setDevices(r) } finally { setScanning(false) }
  }, [])

  useEffect(() => {
    window.shell.system.bluetooth().then((b) => setEnabled(!!b?.enabled)).catch(() => {})
    window.shell.system.bluetoothDevices().then(setDevices).catch(() => {})
    const offDevices = window.shell.system.onBluetoothDevicesChanged((d) => { setDevices(d); setTogglingId(null) })
    const offState = window.shell.system.onBluetoothChanged((b) => setEnabled(!!b?.enabled))
    scan()
    return () => { offDevices(); offState() }
  }, [scan])

  useEffect(() => {
    if (selected > itemCount - 1) setSelected(Math.max(0, itemCount - 1))
  }, [itemCount, selected])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [selected])

  function toggleRadio() {
    const next = !enabled
    setEnabled(next)
    setSelected(0)
    window.shell.system.bluetoothSetRadio(next).then(() => { if (next) scan() }).catch(() => {})
  }

  function toggleDevice(device: BluetoothDevice) {
    if (togglingId) return
    setTogglingId(device.instanceId)
    window.shell.system.bluetoothToggle(device.instanceId, device.connected ? "disconnect" : "connect")
  }

  function activate(idx: number) {
    if (idx === 0) { toggleRadio(); return }
    const device = devices[idx - 1]
    if (device) toggleDevice(device)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Backspace" || e.key === "ArrowLeft") { e.preventDefault(); onBack() }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, itemCount - 1)) }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
      else if (e.key === "Enter") { e.preventDefault(); activate(selected) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div ref={listRef} className="flex flex-col p-1.5 gap-0.5 max-h-[60vh] overflow-y-auto">
      <button
        data-idx={0}
        onMouseMove={() => setSelected(0)}
        onClick={toggleRadio}
        className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${selected === 0 ? selectedBg : ""}`}
      >
        <Bluetooth size={18} className={`w-7 shrink-0 ${dimText}`} />
        <span className={`flex-1 text-[13px] ${textColor}`}>Bluetooth</span>
        <SubToggle on={enabled} darkText={darkText} />
      </button>

      {enabled && <div className={`h-px my-1 ${darkText ? "bg-black/10" : "bg-white/10"}`} />}

      {!enabled ? null : scanning && devices.length === 0 ? (
        <div className={`flex items-center justify-center py-4 ${dimText}`}><Loader2 size={18} className="animate-spin" /></div>
      ) : devices.length === 0 ? (
        <div className={`flex items-center gap-2 justify-center py-4 text-[13px] ${dimText}`}><Bluetooth size={15} /><span>No devices</span></div>
      ) : (
        devices.map((device, i) => {
          const idx = i + 1
          const busy = togglingId === device.instanceId
          return (
            <button
              key={device.instanceId}
              data-idx={idx}
              onMouseMove={() => setSelected(idx)}
              onClick={() => toggleDevice(device)}
              className={`w-full flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${idx === selected ? selectedBg : ""}`}
            >
              <span className="w-7 shrink-0 flex justify-center">
                {busy ? <Loader2 size={15} className={`animate-spin ${dimText}`} /> : device.connected ? <BluetoothConnected color={iconColor} size={15} /> : <Bluetooth color={iconDim} size={15} />}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className={`text-[13px] truncate ${textColor}`}>{device.name}</span>
                <span className={`text-[11px] ${dimText}`}>{busy ? (device.connected ? "Disconnecting…" : "Connecting…") : device.connected ? "Connected" : "Paired"}</span>
              </div>
            </button>
          )
        })
      )}
    </div>
  )
}

type LauncherMenuItem =
  | { id: string; kind: "toggle"; label: string; icon?: LucideIcon; iconSrc?: string | null; dividerAfter?: boolean; value: boolean; onToggle: () => void }
  | { id: string; kind: "slider"; label: string; icon?: LucideIcon; iconSrc?: string | null; dividerAfter?: boolean; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }
  | { id: string; kind: "select"; label: string; icon?: LucideIcon; iconSrc?: string | null; dividerAfter?: boolean; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }
  | { id: string; kind: "action"; label: string; icon?: LucideIcon; iconSrc?: string | null; dividerAfter?: boolean; onRun: () => void }
  | { id: string; kind: "submenu"; label: string; icon?: LucideIcon; iconSrc?: string | null; dividerAfter?: boolean; onOpen: () => void }

function LauncherMenu({ items, darkText, onBack, onSelectionChange, emptyText }: { items: LauncherMenuItem[]; darkText: boolean; onBack: () => void; onSelectionChange?: (item: LauncherMenuItem | undefined) => void; emptyText?: string }) {
  const textColor = darkText ? "text-black" : "text-white"
  const dimText = darkText ? "text-black/50" : "text-white/50"
  const selectedBg = darkText ? "bg-black/10" : "bg-white/10"
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected > items.length - 1) setSelected(Math.max(0, items.length - 1))
  }, [items.length, selected])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [selected])

  useEffect(() => {
    onSelectionChange?.(items[selected])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  function cycleSelect(item: Extract<LauncherMenuItem, { kind: "select" }>, dir: number) {
    const i = item.options.findIndex((o) => o.value === item.value)
    const next = item.options[(i + dir + item.options.length) % item.options.length]
    if (next) item.onChange(next.value)
  }

  function adjust(item: LauncherMenuItem, dir: number) {
    if (item.kind === "slider") {
      const next = Math.max(item.min, Math.min(item.max, item.value + dir * item.step))
      if (next !== item.value) item.onChange(next)
    } else if (item.kind === "select") {
      cycleSelect(item, dir)
    }
  }

  function activate(item: LauncherMenuItem) {
    if (item.kind === "toggle") item.onToggle()
    else if (item.kind === "action") item.onRun()
    else if (item.kind === "submenu") item.onOpen()
    else if (item.kind === "select") cycleSelect(item, 1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const it = items[selected]
      if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); onBack() }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)) }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
      else if (e.key === "ArrowRight") { if (it && (it.kind === "slider" || it.kind === "select")) { e.preventDefault(); adjust(it, 1) } else if (it && it.kind === "submenu") { e.preventDefault(); it.onOpen() } }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (it && it.kind === "slider") adjust(it, -1); else onBack() }
      else if (e.key === "Enter") { e.preventDefault(); if (it) activate(it) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div ref={listRef} className="flex flex-col p-1.5 gap-0.5 max-h-[60vh] overflow-y-auto">
      {items.length === 0 && emptyText ? (
        <div className={`px-2.5 py-4 text-[13px] ${dimText}`}>{emptyText}</div>
      ) : items.map((item, idx) => {
        const Icon = item.icon
        const isSel = idx === selected
        const rowClass = `flex items-center gap-3 px-2.5 h-12 rounded-md text-left transition-colors ${isSel ? selectedBg : ""}`
        const iconEl = (
          <span className="w-7 shrink-0 flex justify-center">
            {item.iconSrc ? <img src={item.iconSrc} alt="" className="w-[18px] h-[18px] object-contain" draggable={false} /> : Icon ? <Icon size={18} className={dimText} /> : null}
          </span>
        )
        const row = item.kind === "slider" ? (
          <div data-idx={idx} onMouseMove={() => setSelected(idx)} className={rowClass}>
            {iconEl}
            <span className={`shrink-0 text-[13px] ${textColor}`} style={{ width: 110 }}>{item.label}</span>
            <input
              type="range"
              tabIndex={-1}
              min={item.min}
              max={item.max}
              step={item.step}
              value={item.value}
              onChange={(e) => item.onChange(parseInt(e.target.value, 10))}
              onMouseUp={(e) => e.currentTarget.blur()}
              className={`cc-slider animate flex-1 ${darkText ? "cc-slider-light" : ""}`}
              style={{ "--slider-progress": `${((item.value - item.min) / (item.max - item.min)) * 100}%` } as React.CSSProperties}
            />
            <span className={`shrink-0 text-[12px] tabular-nums ${dimText}`}>{item.value}{item.unit ?? ""}</span>
          </div>
        ) : (
          <button data-idx={idx} onMouseMove={() => setSelected(idx)} onClick={() => activate(item)} className={`${rowClass} cursor-pointer`}>
            {iconEl}
            <span className={`flex-1 text-[13px] ${textColor}`}>{item.label}</span>
            {item.kind === "toggle" ? (
              <SubToggle on={item.value} darkText={darkText} />
            ) : item.kind === "select" ? (
              <span className={`shrink-0 text-[12px] ${dimText}`}>{item.options.find((o) => o.value === item.value)?.label ?? item.value}</span>
            ) : item.kind === "submenu" ? (
              <ChevronRight size={14} className={`shrink-0 ${darkText ? "text-black/25" : "text-white/25"}`} />
            ) : null}
          </button>
        )
        return (
          <Fragment key={item.id}>
            {row}
            {item.dividerAfter && <div className={`h-px my-1 ${darkText ? "bg-black/10" : "bg-white/10"}`} />}
          </Fragment>
        )
      })}
    </div>
  )
}

function LauncherBrightness({ darkText, onBack, monitors, setBrightness }: { darkText: boolean; onBack: () => void; monitors: MonitorInfo[]; setBrightness: (id: string, value: number) => void }) {
  const items: LauncherMenuItem[] = monitors.map((m): LauncherMenuItem => ({
    id: m.id,
    kind: "slider",
    label: m.name,
    icon: Monitor,
    value: m.brightness,
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    onChange: (v) => setBrightness(m.id, v),
  }))
  return <LauncherMenu items={items} darkText={darkText} onBack={onBack} emptyText="No displays with brightness control" />
}

function LauncherTiling({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const [config, setConfig] = useState<TilingConfig | null>(null)

  useEffect(() => {
    window.shell.tiling.config().then(setConfig).catch(() => {})
    return window.shell.tiling.onConfigChanged(setConfig)
  }, [])

  function patch(p: Partial<TilingConfig>) {
    setConfig((c) => (c ? { ...c, ...p } : c))
    window.shell.tiling.setConfig(p).catch(() => {})
  }

  const items: LauncherMenuItem[] = []
  if (config) {
    items.push({ id: "enabled", kind: "toggle", label: "Window tiling", icon: LayoutDashboard, value: config.enabled, onToggle: () => patch({ enabled: !config.enabled }), dividerAfter: config.enabled })
    if (config.enabled) {
      items.push({ id: "mode", kind: "select", label: "Mode", icon: LayoutDashboard, value: config.mode, options: [{ value: "snap", label: "Snap zones" }, { value: "dynamic", label: "Auto-tile" }], onChange: (v) => patch({ mode: v as TilingMode }) })
      items.push({ id: "hotkeys", kind: "toggle", label: "Win + Arrow snapping", icon: LayoutDashboard, value: config.hotkeys, onToggle: () => patch({ hotkeys: !config.hotkeys }) })
      items.push({ id: "drag", kind: "toggle", label: "Drag to zone", icon: LayoutDashboard, value: config.dragToZone, onToggle: () => patch({ dragToZone: !config.dragToZone }) })
      if (config.mode === "dynamic") {
        items.push({ id: "layout", kind: "select", label: "Layout", icon: LayoutDashboard, value: config.dynamicLayout, options: [{ value: "bsp", label: "Spiral" }, { value: "columns", label: "Columns" }, { value: "master-stack", label: "Master + stack" }], onChange: (v) => patch({ dynamicLayout: v as TilingDynamicLayout }) })
      }
      items.push({ id: "gap", kind: "slider", label: "Gap", icon: LayoutDashboard, value: config.gap, min: 0, max: 40, step: 2, unit: "px", onChange: (v) => patch({ gap: v }) })
      items.push({ id: "margin", kind: "slider", label: "Outer margin", icon: LayoutDashboard, value: config.margin, min: 0, max: 60, step: 2, unit: "px", onChange: (v) => patch({ margin: v }) })
      items.push({ id: "oversized", kind: "toggle", label: "Keep oversized on screen", icon: LayoutDashboard, value: config.handleOversized, onToggle: () => patch({ handleOversized: !config.handleOversized }) })
      if (config.handleOversized) {
        items.push({ id: "placement", kind: "select", label: "Placement", icon: LayoutDashboard, value: config.centerOversized ? "center" : "edge", options: [{ value: "edge", label: "Edge" }, { value: "center", label: "Center" }], onChange: (v) => patch({ centerOversized: v === "center" }) })
      }
      items.push({ id: "reset", kind: "action", label: "Reset split sizes", icon: RotateCcw, onRun: () => patch({ ratios: {} }) })
    }
  }

  return <LauncherMenu items={items} darkText={darkText} onBack={onBack} />
}

function LauncherStartup({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const [entries, setEntries] = useState<StartupEntry[]>([])

  useEffect(() => {
    window.shell.apps.startup().then(setEntries).catch(() => {})
    return window.shell.apps.onStartupChanged(setEntries)
  }, [])

  function toggle(entry: StartupEntry) {
    if (entry.locked) return
    const current = entry.pending !== null ? entry.pending === "enable" : entry.enabled
    window.shell.apps.setStartup(entry.id, !current).then(setEntries).catch(() => {})
  }

  const items: LauncherMenuItem[] = entries.map((e): LauncherMenuItem => ({
    id: e.id,
    kind: "toggle",
    label: e.friendlyName || e.name,
    iconSrc: e.icon,
    value: e.pending !== null ? e.pending === "enable" : e.enabled,
    onToggle: () => toggle(e),
  }))

  return <LauncherMenu items={items} darkText={darkText} onBack={onBack} />
}

function LauncherPower({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const [confirming, setConfirming] = useState<string | null>(null)

  function run(action: "shutdown" | "restart" | "logout") {
    window.shell.system.powerAction(action)
    window.launcher.hide()
  }

  const defs: { id: string; label: string; icon: LucideIcon; action: "shutdown" | "restart" | "logout" }[] = [
    { id: "shutdown", label: "Shut down", icon: Power, action: "shutdown" },
    { id: "restart", label: "Restart", icon: RotateCcw, action: "restart" },
    { id: "logout", label: "Log out", icon: LogOut, action: "logout" },
  ]

  const items: LauncherMenuItem[] = defs.map((d): LauncherMenuItem => ({
    id: d.id,
    kind: "action",
    label: confirming === d.id ? `Confirm ${d.label.toLowerCase()}?` : d.label,
    icon: d.icon,
    onRun: () => { if (confirming === d.id) run(d.action); else setConfirming(d.id) },
  }))

  return <LauncherMenu items={items} darkText={darkText} onBack={onBack} onSelectionChange={(it) => { if (!it || it.id !== confirming) setConfirming(null) }} />
}

function LauncherTray({ darkText, onBack, onSubView }: { darkText: boolean; onBack: () => void; onSubView?: (v: { title: string; back: () => void } | null) => void }) {
  const [settings, setSettings] = useState<TraySettings | null>(null)
  const [display, setDisplay] = useState<TrayDisplaySetting | null>(null)
  const [icons, setIcons] = useState<TrayIcon[]>([])
  const [layout, setLayout] = useState<TrayLayout | null>(null)
  const [view, setView] = useState<"main" | "icons">("main")

  useEffect(() => {
    window.shell.tray.settings().then(setSettings).catch(() => {})
    window.shell.tray.display().then(setDisplay).catch(() => {})
    window.shell.tray.icons().then(setIcons).catch(() => {})
    window.shell.tray.layout().then(setLayout).catch(() => {})
  }, [])

  useEffect(() => () => onSubView?.(null), [onSubView])

  function patchSettings(p: Partial<TraySettings>) {
    setSettings((s) => (s ? { ...s, ...p } : s))
    window.shell.tray.setSettings(p).then(setSettings).catch(() => {})
  }

  function toggleAllMonitors() {
    const next = !display?.showOnAllMonitors
    setDisplay((d) => (d ? { ...d, showOnAllMonitors: next } : d))
    window.shell.tray.setDisplay(next).then(setDisplay).catch(() => {})
  }

  function toggleIcon(icon: TrayIcon) {
    if (!layout) return
    const hidden = layout.hidden.includes(icon.id)
    const next = { ...layout, hidden: hidden ? layout.hidden.filter((id) => id !== icon.id) : [...layout.hidden, icon.id] }
    setLayout(next)
    window.shell.tray.setLayout(next).then(setLayout).catch(() => {})
  }

  function backToMain() { setView("main"); onSubView?.(null) }
  function openIcons() { setView("icons"); onSubView?.({ title: "Tray icons", back: backToMain }) }

  if (view === "icons") {
    const items: LauncherMenuItem[] = icons.map((ic): LauncherMenuItem => ({
      id: ic.id,
      kind: "toggle",
      label: ic.tooltip || "Tray icon",
      iconSrc: ic.icon,
      value: !(layout?.hidden ?? []).includes(ic.id),
      onToggle: () => toggleIcon(ic),
    }))
    return <LauncherMenu key="icons" items={items} emptyText="No system tray icons at the moment" darkText={darkText} onBack={backToMain} />
  }

  const items: LauncherMenuItem[] = []
  if (settings) {
    items.push({ id: "enabled", kind: "toggle", label: "System tray", icon: LayoutGrid, value: settings.enabled, onToggle: () => patchSettings({ enabled: !settings.enabled }), dividerAfter: settings.enabled })
    if (settings.enabled) {
      items.push({ id: "overflow", kind: "toggle", label: "Show overflow arrow", icon: ChevronUp, value: settings.showOverflow, onToggle: () => patchSettings({ showOverflow: !settings.showOverflow }) })
      items.push({ id: "monitors", kind: "toggle", label: "Show on all monitors", icon: Monitor, value: !!display?.showOnAllMonitors, onToggle: toggleAllMonitors })
      items.push({ id: "icons", kind: "submenu", label: "Tray icons", icon: LayoutGrid, onOpen: openIcons })
    }
  }
  return <LauncherMenu key="main" items={items} darkText={darkText} onBack={onBack} />
}

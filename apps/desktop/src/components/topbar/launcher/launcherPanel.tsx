import { createPortal } from "react-dom"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Loader2 } from "lucide-react"
import { useDarkText } from "../../themeContext"
import { useSurfaceSuperseded } from "../../../hooks/useSurfaceSuperseded"
import { useLauncherSurface } from "../../../hooks/useLauncherSurface"
import { useLauncherSearch } from "../../../hooks/useLauncherSearch"
import { useSettingsValues, writeSettingsValue } from "../../../hooks/useSettingsValue"
import { usePowerConfirm } from "../../../hooks/usePowerConfirm"
import { LAUNCHER_SETTINGS, isSettingsValueEntry } from "../../../settings/registry"
import { flattenRows } from "../../../lib/launcher/launcherQuery"
import { RADIUS } from "../chrome/chromeShape"
import { launcherColors } from "./launcherColors"
import { searchPanelMaxHeight } from "./launcherSizing"
import { ARM_ACTION_ID, commandLabel, opensView, rowActions } from "./launcherActions"
import { SearchBar } from "./searchBar"
import { ResultList } from "./resultList"
import { ActionsMenu } from "./actionsMenu"
import { LauncherFooter } from "./launcherFooter"
import { SettingView } from "./views/settingView"
import { WallpaperView } from "./views/wallpaperView"
import { EmojiView } from "./views/emojiView"

const BAR_BOTTOM = 24
const DEFAULT_WIDTH = 720
const UNINSTALL_NOTICE_MS = 1100
const SEARCH_PLACEHOLDER = "Search apps, windows and settings"
const VALUE_ENTRIES = LAUNCHER_SETTINGS.filter(
  (entry): entry is SettingsValueEntry => isSettingsValueEntry(entry) && (entry.control.kind === "toggle" || entry.control.kind === "slider")
)

type ViewKeyHandler = (event: KeyboardEvent) => boolean

function sliderSetting(row: LauncherRow | null): (SettingsValueEntry & { control: SettingsSliderControl }) | null {
  if (!row || row.kind !== "entry" || row.entry.kind !== "setting" || row.entry.setting.control.kind !== "slider") return null
  return row.entry.setting as SettingsValueEntry & { control: SettingsSliderControl }
}

function rowTitle(row: LauncherRow, armedCommandId: string | null): string {
  if (row.kind === "math") return row.value
  if (row.kind === "run") return row.run.display
  if (row.kind === "web") return row.query
  return row.entry.kind === "command" ? commandLabel(row.entry.command, armedCommandId) : row.entry.title
}

function caretAtEnd(input: HTMLInputElement): boolean {
  return input.selectionStart === input.value.length && input.selectionEnd === input.value.length
}

function isCtrl(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey
}

function placeholderFor(view: LauncherView): string {
  if (view.kind === "emoji") return "Search emoji"
  if (view.kind === "wallpaper") return "Filter wallpapers"
  return SEARCH_PLACEHOLDER
}

export default function LauncherPanel({ mode }: { mode?: string }) {
  const darkText = useDarkText()
  const colors = launcherColors(darkText)
  const emojiCapture = mode === "emoji"
  const [view, setView] = useState<LauncherView>(() => (emojiCapture ? { kind: "emoji", insertIntoForeground: true } : { kind: "search" }))
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionIndex, setActionIndex] = useState(0)
  const [armedCommandId, setArmedCommandId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; busy: boolean } | null>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [viewTitle, setViewTitle] = useState<string | null>(null)
  const [returnTo, setReturnTo] = useState<{ query: string; selectedId: string | null }>({ query: "", selectedId: null })
  const viewKeys = useRef<ViewKeyHandler | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const surfaceId = useLauncherSurface(panelRef, bodyRef, width, BAR_BOTTOM, view.kind === "search" ? searchPanelMaxHeight() : 0)
  const superseded = useSurfaceSuperseded(surfaceId)
  const settingValues = useSettingsValues(VALUE_ENTRIES)
  const powerConfirm = usePowerConfirm()
  const sections = useLauncherSearch(query, view.kind === "search")
  const rows = useMemo(() => flattenRows(sections), [sections])
  const selectedRow = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null
  const selectedIndex = selectedRow ? rows.indexOf(selectedRow) : -1

  const registerViewKeys = useCallback((handler: ViewKeyHandler | null) => { viewKeys.current = handler }, [])
  const changeQueryBy = useCallback((update: (current: string) => string) => setQuery(update), [])

  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])

  useEffect(() => {
    if (emojiCapture) return
    const onBlur = () => { if (!notice) window.launcher.hide() }
    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [notice, emojiCapture])

  function focusInput() {
    setFocusRequest((request) => request + 1)
  }

  function changeQuery(next: string) {
    setQuery(next)
    setSelectedId(null)
    setArmedCommandId(null)
  }

  function select(id: string) {
    if (id !== selectedRow?.id) setArmedCommandId(null)
    setSelectedId(id)
  }

  function enterView(next: LauncherView) {
    setReturnTo({ query, selectedId: selectedRow?.id ?? null })
    setView(next)
    setActionsOpen(false)
    setViewTitle(null)
    setQuery("")
    focusInput()
  }

  function exitView() {
    setView({ kind: "search" })
    setViewTitle(null)
    setQuery(returnTo.query)
    setSelectedId(returnTo.selectedId)
    focusInput()
  }

  async function runUninstall(item: LauncherItem) {
    setActionsOpen(false)
    setNotice({ text: `Removing ${item.name}…`, busy: true })
    const result = await window.launcher.uninstall(item.id)
    if (result.mode !== "store") {
      window.launcher.hide()
      return
    }
    setNotice({ text: result.ok ? `${item.name} removed` : `Couldn't remove ${item.name}`, busy: false })
    setTimeout(() => window.launcher.hide(), UNINSTALL_NOTICE_MS)
  }

  const actionContext: LauncherActionContext = {
    query,
    settingValues,
    powerConfirm,
    armedCommandId,
    arm: setArmedCommandId,
    enterView,
    uninstall: runUninstall,
  }
  const actions = selectedRow ? rowActions(selectedRow, actionContext) : []

  function remember(row: LauncherRow) {
    if (row.kind === "entry") window.launcher.recordSelection(row.entry.rankKey, query).catch(() => {})
  }

  function runAction(row: LauncherRow, action: LauncherAction) {
    if (action.id !== ARM_ACTION_ID) remember(row)
    setActionsOpen(false)
    action.run()
  }

  function activate(row: LauncherRow) {
    select(row.id)
    const [primary] = rowActions(row, actionContext)
    if (primary) runAction(row, primary)
  }

  function openActions() {
    if (!selectedRow || actions.length === 0) return
    setActionsOpen(true)
    setActionIndex(0)
  }

  function closeActions() {
    setActionsOpen(false)
    focusInput()
  }

  function adjustSlider(setting: SettingsValueEntry & { control: SettingsSliderControl }, direction: number) {
    const { min, max, step } = setting.control
    const current = typeof settingValues[setting.id] === "number" ? (settingValues[setting.id] as number) : min
    const next = Math.max(min, Math.min(max, current + direction * step))
    if (next !== current) writeSettingsValue(setting, next)
  }

  function moveSelection(step: number) {
    if (rows.length === 0) return
    select(rows[Math.min(rows.length - 1, Math.max(0, selectedIndex + step))].id)
  }

  function handleActionsKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowLeft" || (isCtrl(event) && event.key.toLowerCase() === "k")) {
      event.preventDefault()
      closeActions()
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setActionIndex((index) => Math.min(index + 1, actions.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActionIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const action = actions[actionIndex]
      if (action && selectedRow) runAction(selectedRow, action)
    }
  }

  function handleHorizontalKey(event: KeyboardEvent<HTMLInputElement>) {
    const slider = sliderSetting(selectedRow)
    if (slider) {
      event.preventDefault()
      adjustSlider(slider, event.key === "ArrowRight" ? 1 : -1)
      return
    }
    if (event.key !== "ArrowRight" || !selectedRow || !caretAtEnd(event.currentTarget)) return
    if (selectedRow.kind === "entry" && selectedRow.entry.kind === "setting" && opensView(selectedRow.entry.setting)) {
      event.preventDefault()
      activate(selectedRow)
    } else if (actions.length > 1) {
      event.preventDefault()
      openActions()
    }
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    const ctrl = isCtrl(event)
    const key = event.key.toLowerCase()
    if (event.key === "ArrowDown" || (ctrl && key === "n")) {
      event.preventDefault()
      moveSelection(1)
    } else if (event.key === "ArrowUp" || (ctrl && key === "p")) {
      event.preventDefault()
      moveSelection(-1)
    } else if (ctrl && key === "k") {
      event.preventDefault()
      openActions()
    } else if (event.key === "Enter") {
      event.preventDefault()
      const action = ctrl ? actions[1] : actions[0]
      if (action && selectedRow) runAction(selectedRow, action)
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      handleHorizontalKey(event)
    }
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (notice) {
      if (event.key === "Escape") {
        event.preventDefault()
        window.launcher.hide()
      }
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      if (actionsOpen) closeActions()
      else if (view.kind !== "search" && !emojiCapture) exitView()
      else window.launcher.hide()
      return
    }
    if (view.kind !== "search") {
      if (event.key === "Backspace" && query === "" && !emojiCapture) {
        event.preventDefault()
        exitView()
      } else if (viewKeys.current?.(event)) {
        event.preventDefault()
      }
      return
    }
    if (actionsOpen) handleActionsKey(event)
    else handleSearchKey(event)
  }

  function renderContent() {
    if (notice) {
      return (
        <div className="flex items-center gap-3 px-4 h-12">
          {notice.busy && <Loader2 size={16} className={`shrink-0 animate-spin ${colors.icon}`} />}
          <span className={`text-[14px] ${colors.text}`}>{notice.text}</span>
        </div>
      )
    }
    if (view.kind === "setting") return <SettingView settingId={view.settingId} darkText={darkText} onBack={exitView} onTitleChange={setViewTitle} />
    if (view.kind === "wallpaper") {
      return <WallpaperView query={query} darkText={darkText} defaultWidth={DEFAULT_WIDTH} onWidthChange={setWidth} registerKeys={registerViewKeys} />
    }
    if (view.kind === "emoji") {
      return (
        <EmojiView
          query={query}
          darkText={darkText}
          insertIntoForeground={view.insertIntoForeground}
          capturesKeys={emojiCapture}
          onQueryChange={changeQueryBy}
          registerKeys={registerViewKeys}
        />
      )
    }
    if (rows.length === 0) return null
    return (
      <>
        {actionsOpen ? (
          <ActionsMenu actions={actions} selectedIndex={actionIndex} darkText={darkText} onHover={setActionIndex} onRun={(action) => selectedRow && runAction(selectedRow, action)} />
        ) : (
          <ResultList
            sections={sections}
            selectedId={selectedRow?.id ?? null}
            darkText={darkText}
            settingValues={settingValues}
            armedCommandId={armedCommandId}
            onHover={select}
            onActivate={activate}
            onSliderChange={(setting, value) => writeSettingsValue(setting, value)}
            onSliderRelease={(row) => { remember(row); focusInput() }}
          />
        )}
        <LauncherFooter primary={actions[0] ?? null} hasMoreActions={actions.length > 1} actionsOpen={actionsOpen} darkText={darkText} />
      </>
    )
  }

  const content = renderContent()
  const inView = view.kind !== "search"
  const barTitle = view.kind === "setting" ? viewTitle ?? view.title : null
  const back = actionsOpen ? closeActions : inView && !emojiCapture ? exitView : null

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      style={superseded ? { visibility: "hidden", pointerEvents: "none" } : undefined}
      onMouseDown={() => window.launcher.hide()}
    >
      <div
        ref={panelRef}
        className="absolute"
        style={{ top: BAR_BOTTOM, left: "50%", width, transform: "translateX(-50%)", outline: "none", overflow: "clip", borderRadius: `0 0 ${RADIUS}px ${RADIUS}px`, willChange: "clip-path" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div ref={bodyRef} className="flex flex-col">
          <SearchBar
            darkText={darkText}
            inputRef={inputRef}
            value={actionsOpen && selectedRow ? rowTitle(selectedRow, armedCommandId) : query}
            placeholder={placeholderFor(view)}
            title={barTitle}
            readOnly={actionsOpen}
            onBack={back}
            onChange={changeQuery}
            onKeyDown={handleKey}
          />
          {content && <div className={`h-px w-full ${colors.divider}`} />}
          {content}
        </div>
      </div>
    </div>,
    document.body
  )
}

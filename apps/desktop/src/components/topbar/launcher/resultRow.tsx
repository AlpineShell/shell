import { memo, type CSSProperties, type ReactNode } from "react"
import { ChevronRight, Copy, Equal, FileText, FolderOpen, Globe, Play, Search, Terminal } from "lucide-react"
import { settingsEntryHint } from "../../../settings/registry"
import { isAlpineSettingsItem } from "../../../lib/launcher/launcherEntries"
import { launcherColors } from "./launcherColors"
import { commandLabel, opensView } from "./launcherActions"
import { BookmarkIcon, GlyphIcon, OpenWindowIcon, PluginBadgedIcon, TabIcon } from "./resultIcons"
import { SubToggle } from "./views/launcherMenu"

const RUN_ICONS: Record<RunResult["kind"], SettingsIcon> = { folder: FolderOpen, file: FileText, url: Globe, shell: FolderOpen, command: Terminal }

interface ResultRowProps {
  row: LauncherRow
  selected: boolean
  darkText: boolean
  settingValues: Record<string, SettingsValue>
  armedCommandId: string | null
  onHover: (id: string) => void
  onActivate: (row: LauncherRow) => void
  onSliderChange: (setting: SettingsValueEntry, value: number) => void
  onSliderRelease: (row: LauncherRow) => void
}

function Lines({ title, subtitle, darkText, strong }: { title: string; subtitle?: string; darkText: boolean; strong?: boolean }) {
  const colors = launcherColors(darkText)
  return (
    <div className="flex flex-col min-w-0 flex-1">
      <span className={`${strong ? "text-[15px] font-medium" : "text-[13px]"} truncate ${colors.text}`}>{title}</span>
      {subtitle ? <span className={`text-[11px] truncate ${colors.dim}`}>{subtitle}</span> : null}
    </div>
  )
}

function entryIcon(entry: LauncherEntry, darkText: boolean): ReactNode {
  switch (entry.kind) {
    case "window": return <OpenWindowIcon icon={entry.app.icon} darkText={darkText} />
    case "tab": return <TabIcon favicon={entry.favicon} windowIcon={entry.windowIcon} darkText={darkText} />
    case "bookmark": return <BookmarkIcon favicon={entry.bookmark.favicon} darkText={darkText} />
    case "setting": return <GlyphIcon icon={entry.setting.icon} darkText={darkText} />
    case "command": return <GlyphIcon icon={entry.command.icon} darkText={darkText} />
    case "app":
      return isAlpineSettingsItem(entry.item)
        ? <img src={window.shell.settingsIcon} alt="" className="w-7 h-7 shrink-0" draggable={false} />
        : <PluginBadgedIcon src={entry.item.icon} badge={entry.item.badge} darkText={darkText} />
  }
}

function entryTitle(entry: LauncherEntry, armedCommandId: string | null): string {
  return entry.kind === "command" ? commandLabel(entry.command, armedCommandId) : entry.title
}

function settingAccessory(setting: SettingsEntry, settingValues: Record<string, SettingsValue>, darkText: boolean): ReactNode {
  if (setting.control.kind === "toggle") return <SubToggle on={settingValues[setting.id] === true} darkText={darkText} />
  if (opensView(setting)) return <ChevronRight size={14} className={`shrink-0 ${launcherColors(darkText).faint}`} />
  return null
}

function SliderRow({ row, setting, selected, darkText, value, onHover, onSliderChange, onSliderRelease }: {
  row: LauncherRow
  setting: SettingsValueEntry & { control: SettingsSliderControl }
  selected: boolean
  darkText: boolean
  value: number
  onHover: (id: string) => void
  onSliderChange: (setting: SettingsValueEntry, value: number) => void
  onSliderRelease: (row: LauncherRow) => void
}) {
  const colors = launcherColors(darkText)
  const { min, max, step, unit } = setting.control
  return (
    <div data-row-id={row.id} onMouseMove={() => onHover(row.id)} className={`flex items-center gap-3 px-2.5 h-12 rounded-md transition-colors ${selected ? colors.selected : colors.hover}`}>
      <GlyphIcon icon={setting.icon} darkText={darkText} />
      <span className={`shrink-0 w-28 text-[13px] truncate ${colors.text}`}>{setting.label}</span>
      <input
        type="range"
        tabIndex={-1}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onSliderChange(setting, parseInt(event.target.value, 10))}
        onMouseUp={() => onSliderRelease(row)}
        className={`cc-slider animate flex-1 ${darkText ? "cc-slider-light" : ""}`}
        style={{ "--slider-progress": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
      <span className={`shrink-0 w-10 text-right text-[12px] tabular-nums ${colors.dim}`}>{value}{unit ?? ""}</span>
    </div>
  )
}

function sliderSetting(entry: LauncherEntry): (SettingsValueEntry & { control: SettingsSliderControl }) | null {
  if (entry.kind !== "setting" || entry.setting.control.kind !== "slider") return null
  return entry.setting as SettingsValueEntry & { control: SettingsSliderControl }
}

function rowContent(row: LauncherRow, darkText: boolean, settingValues: Record<string, SettingsValue>, armedCommandId: string | null): ReactNode {
  const colors = launcherColors(darkText)
  if (row.kind === "math") {
    return (
      <>
        <GlyphIcon icon={Equal} darkText={darkText} />
        <Lines title={row.value} darkText={darkText} strong />
        <Copy size={13} className={`shrink-0 ${colors.faint}`} />
      </>
    )
  }
  if (row.kind === "run") {
    const icon = row.run.kind === "command" ? (row.run.runInTerminal ? Terminal : Play) : RUN_ICONS[row.run.kind]
    return (
      <>
        <GlyphIcon icon={icon} darkText={darkText} />
        <Lines title={row.run.label} subtitle={row.run.display} darkText={darkText} />
      </>
    )
  }
  if (row.kind === "web") {
    return (
      <>
        <GlyphIcon icon={Search} darkText={darkText} />
        <Lines title={`Search the web for “${row.query}”`} darkText={darkText} />
      </>
    )
  }
  const { entry } = row
  const subtitle = entry.kind === "setting" ? settingsEntryHint(entry.setting) : entry.subtitle
  return (
    <>
      {entryIcon(entry, darkText)}
      <Lines title={entryTitle(entry, armedCommandId)} subtitle={subtitle} darkText={darkText} />
      {entry.kind === "setting" ? settingAccessory(entry.setting, settingValues, darkText) : null}
    </>
  )
}

function ResultRowView({ row, selected, darkText, settingValues, armedCommandId, onHover, onActivate, onSliderChange, onSliderRelease }: ResultRowProps) {
  const colors = launcherColors(darkText)
  const slider = row.kind === "entry" ? sliderSetting(row.entry) : null
  if (slider) {
    const current = settingValues[slider.id]
    const value = typeof current === "number" ? current : slider.control.min
    return (
      <SliderRow
        row={row}
        setting={slider}
        selected={selected}
        darkText={darkText}
        value={value}
        onHover={onHover}
        onSliderChange={onSliderChange}
        onSliderRelease={onSliderRelease}
      />
    )
  }
  return (
    <button
      type="button"
      data-row-id={row.id}
      onMouseMove={() => onHover(row.id)}
      onClick={() => onActivate(row)}
      className={`flex items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${selected ? colors.selected : colors.hover}`}
    >
      {rowContent(row, darkText, settingValues, armedCommandId)}
    </button>
  )
}

export const ResultRow = memo(ResultRowView)

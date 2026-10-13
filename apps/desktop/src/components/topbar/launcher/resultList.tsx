import { useEffect, useRef } from "react"
import { launcherColors } from "./launcherColors"
import { ResultRow } from "./resultRow"

const SECTION_TITLES: Record<LauncherSectionId, string> = {
  calculator: "Calculator",
  run: "Run",
  windows: "Windows",
  apps: "Apps",
  commands: "Commands",
  settings: "Settings",
  bookmarks: "Bookmarks",
  web: "Web",
}

function attributeValue(value: string): string {
  return value.replace(/["\\]/g, "\\$&")
}

interface ResultListProps {
  sections: LauncherSection[]
  selectedId: string | null
  darkText: boolean
  settingValues: Record<string, SettingsValue>
  armedCommandId: string | null
  onHover: (id: string) => void
  onActivate: (row: LauncherRow) => void
  onSliderChange: (setting: SettingsValueEntry, value: number) => void
  onSliderRelease: (row: LauncherRow) => void
}

export function ResultList({ sections, selectedId, darkText, ...rowProps }: ResultListProps) {
  const colors = launcherColors(darkText)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedId) return
    const row = listRef.current?.querySelector(`[data-row-id="${attributeValue(selectedId)}"]`) as HTMLElement | null
    row?.scrollIntoView({ block: "nearest" })
  }, [selectedId])

  return (
    <div ref={listRef} role="listbox" className={`flex flex-col px-1.5 pb-1.5 max-h-[min(560px,70vh)] overflow-y-auto cc-scroll ${darkText ? "cc-scroll-light" : ""}`}>
      {sections.map((section) => (
        <div key={section.id} role="group" aria-label={SECTION_TITLES[section.id]} className="flex flex-col gap-0.5">
          <div className={`px-2.5 pt-2 pb-1 text-[11px] font-medium ${colors.dim}`}>{SECTION_TITLES[section.id]}</div>
          {section.rows.map((row) => (
            <ResultRow key={row.id} row={row} selected={row.id === selectedId} darkText={darkText} {...rowProps} />
          ))}
        </div>
      ))}
    </div>
  )
}

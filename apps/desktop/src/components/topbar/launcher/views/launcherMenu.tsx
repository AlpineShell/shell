import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react"
import { ChevronRight } from "lucide-react"
import { launcherColors } from "../launcherColors"

export const MENU_LIST_CLASS = "flex flex-col p-1.5 gap-0.5 max-h-[min(260px,60vh)] overflow-y-auto min-h-0 snap-y snap-proximity cc-scroll"

export function SubToggle({ on, darkText }: { on: boolean; darkText: boolean }) {
  const track = on ? (darkText ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)") : darkText ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.18)"
  const knob = on ? (darkText ? "rgb(255,255,255)" : "rgb(20,20,20)") : darkText ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)"
  return (
    <span className="relative shrink-0 rounded-full transition-colors" style={{ width: 32, height: 18, backgroundColor: track }}>
      <span className="absolute top-0.5 rounded-full transition-all" style={{ width: 14, height: 14, left: on ? 16 : 2, backgroundColor: knob }} />
    </span>
  )
}

export function MenuDivider({ darkText }: { darkText: boolean }) {
  return <div className={`h-px my-1 shrink-0 ${launcherColors(darkText).divider}`} />
}

interface LauncherMenuProps {
  items: LauncherMenuItem[]
  darkText: boolean
  onBack: () => void
  onSelectionChange?: (item: LauncherMenuItem | undefined) => void
  emptyText?: string
}

function cycleSelect(item: Extract<LauncherMenuItem, { kind: "select" }>, direction: number) {
  const current = item.options.findIndex((option) => option.value === item.value)
  const next = item.options[(current + direction + item.options.length) % item.options.length]
  if (next) item.onChange(next.value)
}

function adjust(item: LauncherMenuItem, direction: number) {
  if (item.kind === "slider") {
    const next = Math.max(item.min, Math.min(item.max, item.value + direction * item.step))
    if (next !== item.value) item.onChange(next)
  } else if (item.kind === "select") {
    cycleSelect(item, direction)
  }
}

function activate(item: LauncherMenuItem) {
  if (item.kind === "toggle") item.onToggle()
  else if (item.kind === "action") item.onRun()
  else if (item.kind === "submenu") item.onOpen()
  else if (item.kind === "select") cycleSelect(item, 1)
}

export function LauncherMenu({ items, darkText, onBack, onSelectionChange, emptyText }: LauncherMenuProps) {
  const colors = launcherColors(darkText)
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const current = Math.min(selected, Math.max(0, items.length - 1))

  useEffect(() => {
    const element = listRef.current?.querySelector(`[data-idx="${current}"]`) as HTMLElement | null
    element?.scrollIntoView({ block: "nearest" })
  }, [current])

  useEffect(() => {
    onSelectionChange?.(items[current])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const item = items[current]
      if (event.key === "Escape" || event.key === "Backspace") { event.preventDefault(); onBack() }
      else if (event.key === "ArrowDown") { event.preventDefault(); setSelected(Math.min(current + 1, items.length - 1)) }
      else if (event.key === "ArrowUp") { event.preventDefault(); setSelected(Math.max(current - 1, 0)) }
      else if (event.key === "ArrowRight") {
        if (item && (item.kind === "slider" || item.kind === "select")) { event.preventDefault(); adjust(item, 1) }
        else if (item && item.kind === "submenu") { event.preventDefault(); item.onOpen() }
      } else if (event.key === "ArrowLeft") { event.preventDefault(); if (item && item.kind === "slider") adjust(item, -1); else onBack() }
      else if (event.key === "Enter") { event.preventDefault(); if (item) activate(item) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div ref={listRef} className={`${MENU_LIST_CLASS} ${darkText ? "cc-scroll-light" : ""}`}>
      {items.length === 0 && emptyText ? (
        <div className={`px-2.5 py-4 text-[13px] shrink-0 ${colors.dim}`}>{emptyText}</div>
      ) : items.map((item, index) => {
        const Icon = item.icon
        const isSelected = index === current
        const rowClass = `flex shrink-0 snap-start items-center gap-3 px-2.5 h-12 rounded-md text-left transition-colors ${isSelected ? colors.selected : ""}`
        const icon = (
          <span className="w-7 shrink-0 flex justify-center">
            {item.iconSrc ? <img src={item.iconSrc} alt="" className="w-[18px] h-[18px] object-contain" draggable={false} /> : Icon ? <Icon size={18} className={colors.dim} /> : null}
          </span>
        )
        const row = item.kind === "slider" ? (
          <div data-idx={index} onMouseMove={() => setSelected(index)} className={rowClass}>
            {icon}
            <span className={`shrink-0 text-[13px] ${colors.text}`} style={{ width: 110 }}>{item.label}</span>
            <input
              type="range"
              tabIndex={-1}
              min={item.min}
              max={item.max}
              step={item.step}
              value={item.value}
              onChange={(event) => item.onChange(parseInt(event.target.value, 10))}
              onMouseUp={(event) => event.currentTarget.blur()}
              className={`cc-slider animate flex-1 ${darkText ? "cc-slider-light" : ""}`}
              style={{ "--slider-progress": `${((item.value - item.min) / (item.max - item.min)) * 100}%` } as CSSProperties}
            />
            <span className={`shrink-0 text-[12px] tabular-nums ${colors.dim}`}>{item.value}{item.unit ?? ""}</span>
          </div>
        ) : (
          <button type="button" data-idx={index} onMouseMove={() => setSelected(index)} onClick={() => activate(item)} className={`${rowClass} cursor-pointer`}>
            {icon}
            <span className={`flex-1 text-[13px] ${colors.text}`}>{item.label}</span>
            {item.kind === "toggle" ? (
              <SubToggle on={item.value} darkText={darkText} />
            ) : item.kind === "select" ? (
              <span className={`shrink-0 text-[12px] ${colors.dim}`}>{item.options.find((option) => option.value === item.value)?.label ?? item.value}</span>
            ) : item.kind === "submenu" ? (
              <ChevronRight size={14} className={`shrink-0 ${colors.faint}`} />
            ) : null}
          </button>
        )
        return (
          <Fragment key={item.id}>
            {row}
            {item.dividerAfter && <MenuDivider darkText={darkText} />}
          </Fragment>
        )
      })}
    </div>
  )
}

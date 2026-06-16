import { createPortal } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTopbarBg, useDarkText, useFullscreenWindow } from "../themeContext"
import { useFlyUnderBar } from "../../hooks/useFlyUnderBar"
import { SHOULDER, RADIUS, fillPath, borderPath } from "./shared/menuShape"

interface AltTabPanelProps {
  onGapChange: (gap: { left: number; right: number } | null) => void
}

function WindowEntry({ window, selected, darkText }: { window: AltTabWindow; selected: boolean; darkText: boolean }) {
  const [thumbWidth, setThumbWidth] = useState(200)
  const cardWidth = Math.max(100, Math.min(200, thumbWidth))

  return (
    <div
      className="rounded-md overflow-hidden shrink-0"
      style={{
        width: cardWidth,
        boxShadow: selected
          ? `0 0 0 2px ${darkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)"}`
          : `0 0 0 1px ${darkText ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
        backgroundColor: darkText ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        {window.icon && (
          <img src={window.icon} alt="" className="w-4 h-4 shrink-0" draggable={false} />
        )}
        <span className={`text-xs truncate ${darkText ? "text-black" : "text-white"}`}>{window.processName}</span>
      </div>
      <div className="w-full h-31 flex items-center pb-1 justify-center">
        {window.thumbnail ? (
          <img
            src={window.thumbnail}
            alt=""
            className="max-w-full rounded-md max-h-full object-contain"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              const aspect = img.naturalWidth / img.naturalHeight
              setThumbWidth(Math.round(124 * aspect))
            }}
          />
        ) : window.icon ? (
          <img src={window.icon} alt="" className="w-12 h-12 opacity-60" draggable={false} />
        ) : null}
      </div>
    </div>
  )
}

export default function AltTabPanel({ onGapChange }: AltTabPanelProps) {
  const bg = useTopbarBg()
  const darkText = useDarkText()
  const fullscreenWindow = useFullscreenWindow()
  const borderColor = fullscreenWindow ? (darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)") : null

  const [windows, setWindows] = useState<AltTabWindow[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useFlyUnderBar(bodyRef, [], SHOULDER, visible, closing)

  useEffect(() => {
    window.alttab.onShow((data) => {
      clearTimeout(closeTimer.current)
      setClosing(false)
      setWindows(data.windows)
      setSelectedIndex(data.selectedIndex)
      setVisible(true)
    })
    window.alttab.onHide(() => {
      setClosing(true)
      closeTimer.current = setTimeout(() => {
        setVisible(false)
        setClosing(false)
        setWindows([])
        setSelectedIndex(0)
        setSize(null)
      }, 300)
    })
    window.alttab.onSelectionChanged(setSelectedIndex)
  }, [])

  useLayoutEffect(() => {
    if (!visible) {
      onGapChange(null)
      return
    }
    const panel = panelRef.current
    if (!panel) return
    const update = () => {
      const rect = panel.getBoundingClientRect()
      const w = Math.round(rect.width) + SHOULDER * 2
      const h = Math.round(rect.height)
      setSize((prev) => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }))
      const left = Math.round((window.innerWidth - w) / 2)
      onGapChange({ left, right: left + w })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [visible])

  if (!visible || windows.length === 0) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ pointerEvents: "none" }}>
      <div style={{ marginTop: 24, position: "relative", clipPath: "inset(0 -2000px -2000px -2000px)" }}>
        <div ref={bodyRef} style={{ position: "relative", willChange: "transform" }}>
          {size && (
            <svg
              width={size.w}
              height={size.h}
              viewBox={`0 0 ${size.w} ${size.h}`}
              style={{ position: "absolute", top: 0, left: -SHOULDER, display: "block", overflow: "visible", filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.32))" }}
            >
              <path d={fillPath(size.w, size.h)} fill={bg} />
              {borderColor && (
                <path d={borderPath(size.w, size.h)} fill="none" stroke={borderColor} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              )}
            </svg>
          )}
          <div
            ref={panelRef}
            className="relative overflow-hidden p-3"
            style={{ borderRadius: `0 0 ${RADIUS}px ${RADIUS}px`, maxWidth: "90vw" }}
          >
            <div className="flex flex-wrap justify-center gap-2">
              {windows.map((w, i) => (
                <WindowEntry key={w.hwnd} window={w} selected={i === selectedIndex} darkText={darkText} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

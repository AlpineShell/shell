import { createPortal } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { useDarkText } from "../themeContext"
import { useSurfaceSuperseded } from "../../hooks/useSurfaceSuperseded"
import { RADIUS } from "./chrome/chromeShape"
import { setChromeSurface, clearChromeSurface, nextSurfaceId } from "./chrome/chromeStore"

const BAR_BOTTOM = 24
const CLOSE_MS = 300
const PAD = 12

const MODE_LABELS: Record<DisplayMode, string> = {
  internal: "PC screen only",
  clone: "Duplicate",
  extend: "Extend",
  external: "Second screen only",
}

type Shape = { bodyWidth: number; bodyHeight: number }

function Screen({ x, lit }: { x: number; lit: boolean }) {
  return (
    <rect
      x={x}
      y={7}
      width={19}
      height={14}
      rx={2}
      fill="currentColor"
      fillOpacity={lit ? 0.25 : 0}
      stroke="currentColor"
      strokeOpacity={lit ? 1 : 0.35}
      strokeWidth={1.5}
      strokeDasharray={lit ? undefined : "2 2"}
    />
  )
}

function ModeGlyph({ mode }: { mode: DisplayMode }) {
  const leftLit = mode !== "external"
  const rightLit = mode !== "internal"
  return (
    <svg width={48} height={28} viewBox="0 0 48 28" aria-hidden="true">
      <Screen x={3} lit={leftLit} />
      <Screen x={26} lit={rightLit} />
      {mode === "clone" && (
        <>
          <rect x={9.5} y={11} width={6} height={6} rx={1} fill="currentColor" />
          <rect x={32.5} y={11} width={6} height={6} rx={1} fill="currentColor" />
        </>
      )}
      {mode === "extend" && <rect x={9} y={13} width={30} height={2} rx={1} fill="currentColor" />}
    </svg>
  )
}

function ModeTile({ option, selected, current, darkText }: { option: DisplayModeOption; selected: boolean; current: boolean; darkText: boolean }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={!option.available}
      onClick={() => { if (option.available) window.displayMode.choose(option.mode) }}
      className={`relative flex flex-col items-center gap-2 w-28 shrink-0 rounded-md px-2 pt-3 pb-2.5 ${option.available ? "cursor-pointer" : "cursor-default"} ${darkText ? "text-black" : "text-white"}`}
      style={{
        opacity: option.available ? 1 : 0.35,
        boxShadow: selected
          ? `0 0 0 2px ${darkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)"}`
          : `0 0 0 1px ${darkText ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
        backgroundColor: darkText ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
      }}
    >
      {current && <Check size={12} aria-label="Current" className="absolute top-1.5 right-1.5" />}
      <ModeGlyph mode={option.mode} />
      <span className="text-xs text-center leading-tight">{MODE_LABELS[option.mode]}</span>
    </button>
  )
}

export default function DisplayModePanel() {
  const darkText = useDarkText()

  const [picker, setPicker] = useState<DisplayModePickerPayload | null>(null)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [showId, setShowId] = useState(0)
  const [shape, setShape] = useState<Shape | null>(null)

  const clipRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [surfaceId] = useState(nextSurfaceId)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const offShow = window.displayMode.onShow((data) => {
      clearTimeout(closeTimer.current)
      setPicker(data)
      setClosing(false)
      setVisible(true)
      setShowId((n) => n + 1)
    })
    const offHide = window.displayMode.onHide(() => {
      clearChromeSurface(surfaceId)
      setClosing(true)
      closeTimer.current = setTimeout(() => {
        setVisible(false)
        setClosing(false)
        setShape(null)
        setPicker(null)
      }, CLOSE_MS)
    })
    const offSelection = window.displayMode.onSelectionChanged((mode) => {
      setPicker((current) => (current ? { ...current, selectedMode: mode } : current))
    })
    return () => {
      offShow()
      offHide()
      offSelection()
      clearTimeout(closeTimer.current)
    }
  }, [surfaceId])

  useLayoutEffect(() => {
    if (!visible) return
    const body = bodyRef.current
    if (!body) return
    const rect = body.getBoundingClientRect()
    setShape({ bodyWidth: Math.round(rect.width), bodyHeight: Math.round(rect.height) })
  }, [visible, showId])

  useLayoutEffect(() => {
    if (!visible || closing || !shape) return
    const clip = clipRef.current
    if (clip) {
      clip.style.height = `${shape.bodyHeight}px`
      clip.style.clipPath = `inset(0 0 ${shape.bodyHeight}px 0 round 0 0 ${RADIUS}px ${RADIUS}px)`
    }
    setChromeSurface({
      id: surfaceId,
      centerX: Math.round(window.innerWidth / 2),
      bodyWidth: shape.bodyWidth,
      fullHeight: shape.bodyHeight,
      anchor: "center",
      contentEl: clip,
    })
  }, [visible, closing, shape, surfaceId])

  useEffect(() => () => clearChromeSurface(surfaceId), [surfaceId])

  const superseded = useSurfaceSuperseded(surfaceId)

  if (!visible || !picker) return null

  return createPortal(
    <>
      {!closing && (
        <div
          data-testid="display-mode-backdrop"
          onPointerDown={() => window.displayMode.dismiss()}
          style={{ position: "fixed", inset: 0, zIndex: 4 }}
        />
      )}
      <div
        ref={clipRef}
        style={{
          position: "fixed",
          top: BAR_BOTTOM,
          left: "50%",
          transform: "translateX(-50%)",
          width: "max-content",
          maxWidth: "90vw",
          zIndex: 5,
          pointerEvents: closing ? "none" : "auto",
          visibility: superseded ? "hidden" : undefined,
          willChange: "clip-path",
        }}
      >
        <div ref={bodyRef} style={{ padding: PAD }}>
          <div role="listbox" aria-label="Display mode" className="flex gap-2">
            {picker.options.map((option) => (
              <ModeTile
                key={option.mode}
                option={option}
                selected={option.mode === picker.selectedMode}
                current={option.mode === picker.currentMode}
                darkText={darkText}
              />
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

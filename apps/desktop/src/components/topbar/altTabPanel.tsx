import { createPortal } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useDarkText } from "../themeContext"
import { useSurfaceSuperseded } from "../../hooks/useSurfaceSuperseded"
import { RADIUS } from "./chrome/chromeShape"
import { setChromeSurface, clearChromeSurface, nextSurfaceId } from "./chrome/chromeStore"

const BAR_BOTTOM = 24
const CLOSE_MS = 300

type Shape = { bodyWidth: number; bodyHeight: number }

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

export default function AltTabPanel() {
  const darkText = useDarkText()

  const [windows, setWindows] = useState<AltTabWindow[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [showId, setShowId] = useState(0)
  const [shape, setShape] = useState<Shape | null>(null)

  const clipRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)
  if (!idRef.current) idRef.current = nextSurfaceId()
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    window.alttab.onShow((data) => {
      clearTimeout(closeTimer.current)
      setWindows(data.windows)
      setSelectedIndex(data.selectedIndex)
      setVisible(true)
      setShowId((n) => n + 1)
    })
    window.alttab.onHide(() => {
      clearChromeSurface(idRef.current)
      closeTimer.current = setTimeout(() => {
        setVisible(false)
        setShape(null)
        setWindows([])
        setSelectedIndex(0)
      }, CLOSE_MS)
    })
    window.alttab.onSelectionChanged(setSelectedIndex)
    window.alttab.onThumbnail(({ hwnd, thumbnail }) => {
      setWindows((current) => current.map((entry) => (entry.hwnd === hwnd ? { ...entry, thumbnail } : entry)))
    })
  }, [])

  function measureShape(): Shape | null {
    const body = bodyRef.current
    const cards = cardsRef.current
    if (!body) return null
    const PAD = 12
    const bodyHeight = Math.round(body.getBoundingClientRect().height)
    let minLeft = Infinity
    let maxRight = -Infinity
    if (cards) {
      for (const child of Array.from(cards.children) as HTMLElement[]) {
        const r = child.getBoundingClientRect()
        if (r.width === 0) continue
        if (r.left < minLeft) minLeft = r.left
        if (r.right > maxRight) maxRight = r.right
      }
    }
    const contentWidth = isFinite(minLeft) ? maxRight - minLeft : body.getBoundingClientRect().width - PAD * 2
    return { bodyWidth: Math.round(contentWidth + PAD * 2), bodyHeight }
  }

  useLayoutEffect(() => {
    if (!visible) return
    const next = measureShape()
    if (next) setShape(next)
  }, [visible, showId])

  useLayoutEffect(() => {
    if (!visible || !shape) return
    const clip = clipRef.current
    if (clip) {
      clip.style.height = `${shape.bodyHeight}px`
      clip.style.clipPath = `inset(0 0 ${shape.bodyHeight}px 0 round 0 0 ${RADIUS}px ${RADIUS}px)`
    }
    setChromeSurface({
      id: idRef.current,
      centerX: Math.round(window.innerWidth / 2),
      bodyWidth: shape.bodyWidth,
      fullHeight: shape.bodyHeight,
      anchor: "center",
      contentEl: clip,
    })
  }, [visible, shape])

  useEffect(() => {
    if (!visible) return
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(() => {
      const next = measureShape()
      if (!next) return
      setShape((prev) =>
        prev && Math.abs(prev.bodyWidth - next.bodyWidth) < 1 && Math.abs(prev.bodyHeight - next.bodyHeight) < 1
          ? prev
          : next
      )
    })
    observer.observe(body)
    const onResize = () => {
      const next = measureShape()
      if (next) setShape({ ...next })
    }
    window.addEventListener("resize", onResize)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", onResize)
    }
  }, [visible, showId])

  useEffect(() => () => clearChromeSurface(idRef.current), [])

  const superseded = useSurfaceSuperseded(idRef.current)

  if (!visible || windows.length === 0) return null

  return createPortal(
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
        pointerEvents: "none",
        visibility: superseded ? "hidden" : undefined,
        willChange: "clip-path",
      }}
    >
      <div ref={bodyRef} className="p-3">
        <div ref={cardsRef} className="flex flex-wrap justify-center gap-2">
          {windows.map((w, i) => (
            <WindowEntry key={w.hwnd} window={w} selected={i === selectedIndex} darkText={darkText} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

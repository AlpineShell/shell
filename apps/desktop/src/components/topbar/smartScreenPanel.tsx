import { createPortal } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ShieldAlert } from "lucide-react"
import { useDarkText } from "../themeContext"
import { useSurfaceSuperseded } from "../../hooks/useSurfaceSuperseded"
import { RADIUS } from "./chrome/chromeShape"
import { setChromeSurface, clearChromeSurface, nextSurfaceId } from "./chrome/chromeStore"

const BAR_BOTTOM = 24
const CLOSE_MS = 300
const PAD = 16
const WIDTH = 380

const FALLBACK_TITLE = "Windows protected your PC"
const FALLBACK_RUN = "Run anyway"
const FALLBACK_DONT_RUN = "Don't run"

type Shape = { bodyWidth: number; bodyHeight: number }

function ActionButton({ label, primary, disabled = false, darkText, onClick }: { label: string; primary: boolean; disabled?: boolean; darkText: boolean; onClick: () => void }) {
  const fill = primary
    ? darkText ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)"
    : darkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"
  const text = primary ? (darkText ? "text-white" : "text-black") : darkText ? "text-black" : "text-white"
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-8 px-4 rounded-md text-xs font-medium ${disabled ? "cursor-default" : "cursor-pointer"} ${text}`}
      style={{ backgroundColor: fill, opacity: disabled ? 0.35 : 1 }}
    >
      {label}
    </button>
  )
}

export default function SmartScreenPanel() {
  const darkText = useDarkText()

  const [prompt, setPrompt] = useState<SmartScreenPrompt | null>(null)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [showId, setShowId] = useState(0)
  const [shape, setShape] = useState<Shape | null>(null)

  const clipRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [surfaceId] = useState(nextSurfaceId)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const offShow = window.smartScreen.onShow((data) => {
      clearTimeout(closeTimer.current)
      setPrompt(data)
      setClosing(false)
      setVisible(true)
      setShowId((n) => n + 1)
    })
    const offHide = window.smartScreen.onHide(() => {
      clearChromeSurface(surfaceId)
      setClosing(true)
      closeTimer.current = setTimeout(() => {
        setVisible(false)
        setClosing(false)
        setShape(null)
        setPrompt(null)
      }, CLOSE_MS)
    })
    return () => {
      offShow()
      offHide()
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

  if (!visible || !prompt) return null

  const answer = (userAction: SmartScreenUserAction) => window.smartScreen.answer(prompt.id, userAction)
  const textClass = darkText ? "text-black" : "text-white"
  const mutedClass = darkText ? "text-black/60" : "text-white/60"

  return createPortal(
    <>
      {!closing && <div data-testid="smartscreen-backdrop" style={{ position: "fixed", inset: 0, zIndex: 4 }} />}
      <div
        ref={clipRef}
        role="alertdialog"
        aria-labelledby="smartscreen-title"
        aria-describedby="smartscreen-message"
        style={{
          position: "fixed",
          top: BAR_BOTTOM,
          left: "50%",
          transform: "translateX(-50%)",
          width: WIDTH,
          maxWidth: "90vw",
          zIndex: 5,
          pointerEvents: closing ? "none" : "auto",
          visibility: superseded ? "hidden" : undefined,
          willChange: "clip-path",
        }}
      >
        <div ref={bodyRef} className={`flex flex-col gap-3 ${textClass}`} style={{ padding: PAD }}>
          <div className="flex items-start gap-3">
            <ShieldAlert size={22} aria-hidden="true" className="shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <div id="smartscreen-title" className="text-sm font-semibold">{prompt.title || FALLBACK_TITLE}</div>
              {prompt.message && <div id="smartscreen-message" className={`text-xs leading-snug ${mutedClass}`}>{prompt.message}</div>}
            </div>
          </div>
          {prompt.details.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {prompt.details.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className={mutedClass}>{detail.label}</dt>
                  <dd className="select-text break-all">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex justify-end gap-2">
            <ActionButton label={prompt.runLabel || FALLBACK_RUN} primary={false} disabled={!prompt.runLabel} darkText={darkText} onClick={() => answer("run")} />
            <ActionButton label={prompt.dontRunLabel || FALLBACK_DONT_RUN} primary darkText={darkText} onClick={() => answer("norun")} />
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

import { useState, useCallback, useEffect, useRef } from 'react'
import { useScreenshot } from '../../hooks/useScreenshot'

interface Selection {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

function getRect(sel: Selection): Rect {
  const x = Math.min(sel.startX, sel.currentX)
  const y = Math.min(sel.startY, sel.currentY)
  const width = Math.abs(sel.currentX - sel.startX)
  const height = Math.abs(sel.currentY - sel.startY)
  return { x, y, width, height }
}

const DIM = 'bg-black/40'
const SELECTION_OUTLINE = '0 0 0 1px rgba(255, 255, 255, 0.95), 0 0 0 2px rgba(0, 0, 0, 0.6)'
const GUIDE_LINE = 'bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]'
const HANDLE_SIZE = 8
const LABEL_GAP = 8
const SIZE_LABEL_HEIGHT = 26

function sizeLabelTop(rect: Rect, viewportHeight: number) {
  const below = rect.y + rect.height + LABEL_GAP
  return below + SIZE_LABEL_HEIGHT <= viewportHeight ? below : Math.max(LABEL_GAP, rect.y - SIZE_LABEL_HEIGHT - LABEL_GAP)
}

function cornerPoints(rect: Rect): Point[] {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return [
    { x: rect.x, y: rect.y },
    { x: right, y: rect.y },
    { x: rect.x, y: bottom },
    { x: right, y: bottom },
  ]
}

function CursorGuides({ pointer }: { pointer: Point }) {
  return (
    <>
      <div className={`absolute left-0 right-0 h-px pointer-events-none ${GUIDE_LINE}`} style={{ top: pointer.y }} />
      <div className={`absolute top-0 bottom-0 w-px pointer-events-none ${GUIDE_LINE}`} style={{ left: pointer.x }} />
    </>
  )
}

function DimOutside({ rect, viewportWidth, viewportHeight }: { rect: Rect; viewportWidth: number; viewportHeight: number }) {
  const below = rect.y + rect.height
  const right = rect.x + rect.width
  return (
    <>
      <div className={`absolute ${DIM}`} style={{ left: 0, top: 0, width: viewportWidth, height: rect.y }} />
      <div className={`absolute ${DIM}`} style={{ left: 0, top: below, width: viewportWidth, height: viewportHeight - below }} />
      <div className={`absolute ${DIM}`} style={{ left: 0, top: rect.y, width: rect.x, height: rect.height }} />
      <div className={`absolute ${DIM}`} style={{ left: right, top: rect.y, width: viewportWidth - right, height: rect.height }} />
    </>
  )
}

function SelectionFrame({ rect }: { rect: Rect }) {
  return (
    <>
      <div
        className="absolute pointer-events-none"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, boxShadow: SELECTION_OUTLINE }}
      />
      {cornerPoints(rect).map((corner) => (
        <div
          key={`${corner.x === rect.x ? 'left' : 'right'}-${corner.y === rect.y ? 'top' : 'bottom'}`}
          className="absolute rounded-[2px] bg-white border border-black/50 shadow-sm pointer-events-none"
          style={{ left: corner.x - HANDLE_SIZE / 2, top: corner.y - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE }}
        />
      ))}
    </>
  )
}

function SizeLabel({ rect, viewportHeight }: { rect: Rect; viewportHeight: number }) {
  return (
    <div
      className="absolute flex items-center gap-1 h-[26px] px-2 rounded-md bg-zinc-900/85 text-white text-[12px] font-medium tabular-nums shadow-lg ring-1 ring-white/10 pointer-events-none"
      style={{ left: rect.x, top: sizeLabelTop(rect, viewportHeight) }}
    >
      <span>{rect.width}</span>
      <span className="text-white/45">×</span>
      <span>{rect.height}</span>
    </div>
  )
}

export default function ScreenshotOverlay() {
  const { visible, image } = useScreenshot()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!visible) {
      setSelection(null)
      setPointer(null)
      dragging.current = false
    }
  }, [visible])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    setSelection({
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setPointer({ x: e.clientX, y: e.clientY })
    if (!dragging.current) return
    setSelection((prev) =>
      prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null
    )
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!dragging.current || !selection) return
    dragging.current = false

    const rect = getRect(selection)
    if (rect.width > 5 && rect.height > 5) {
      window.screenshot.regionSelected(rect)
    } else {
      window.screenshot.cancel()
    }
    setSelection(null)
  }, [selection])

  if (!visible) return null

  const rect = selection ? getRect(selection) : null
  const area = rect && rect.width > 0 && rect.height > 0 ? rect : null
  const W = window.innerWidth
  const H = window.innerHeight

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {image && (
        <img
          src={image}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      )}
      {area ? (
        <>
          <DimOutside rect={area} viewportWidth={W} viewportHeight={H} />
          <SelectionFrame rect={area} />
          <SizeLabel rect={area} viewportHeight={H} />
        </>
      ) : (
        <>
          <div className={`absolute inset-0 ${DIM}`} />
          {pointer && <CursorGuides pointer={pointer} />}
        </>
      )}
    </div>
  )
}

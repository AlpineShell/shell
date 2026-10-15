import { useState, useCallback, useEffect, useRef } from 'react'
import { useScreenshot } from '../../hooks/useScreenshot'

interface Selection {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function getRect(sel: Selection) {
  const x = Math.min(sel.startX, sel.currentX)
  const y = Math.min(sel.startY, sel.currentY)
  const width = Math.abs(sel.currentX - sel.startX)
  const height = Math.abs(sel.currentY - sel.startY)
  return { x, y, width, height }
}

const DIM = 'bg-black/40'
const SELECTION_OUTLINE = '0 0 0 1px rgba(255, 255, 255, 0.95), 0 0 0 2px rgba(0, 0, 0, 0.6)'
const SIZE_LABEL_HEIGHT = 28

function sizeLabelTop(rect: { y: number; height: number }, viewportHeight: number) {
  const below = rect.y + rect.height + 6
  return below + SIZE_LABEL_HEIGHT <= viewportHeight ? below : Math.max(6, rect.y - SIZE_LABEL_HEIGHT)
}

export default function ScreenshotOverlay() {
  const { visible, image } = useScreenshot()
  const [selection, setSelection] = useState<Selection | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!visible) {
      setSelection(null)
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
      {!rect || rect.width === 0 || rect.height === 0 ? (
        <div className={`absolute inset-0 ${DIM}`} />
      ) : (
        <>
          <div className={`absolute ${DIM}`} style={{ left: 0, top: 0, width: W, height: rect.y }} />
          <div className={`absolute ${DIM}`} style={{ left: 0, top: rect.y + rect.height, width: W, height: H - rect.y - rect.height }} />
          <div className={`absolute ${DIM}`} style={{ left: 0, top: rect.y, width: rect.x, height: rect.height }} />
          <div className={`absolute ${DIM}`} style={{ left: rect.x + rect.width, top: rect.y, width: W - rect.x - rect.width, height: rect.height }} />

          <div
            className="absolute pointer-events-none"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, boxShadow: SELECTION_OUTLINE }}
          />

          <div
            className="absolute bg-black/70 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none"
            style={{ left: rect.x, top: sizeLabelTop(rect, H) }}
          >
            {rect.width} × {rect.height}
          </div>
        </>
      )}
    </div>
  )
}

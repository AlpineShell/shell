import { createPortal } from "react-dom"
import { useEffect, useState } from "react"
import { useTopbarBg, useDarkText, useFullscreenWindow } from "../themeContext"

const CORNER = 12

function WindowEntry({ window, selected, bg, darkText }: { window: AltTabWindow; selected: boolean; bg: string; darkText: boolean }) {
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
  const bg = useTopbarBg()
  const darkText = useDarkText()
  const fullscreenWindow = useFullscreenWindow()
  const borderColor = fullscreenWindow ? (darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)") : null

  const [windows, setWindows] = useState<AltTabWindow[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.alttab.onShow((data) => {
      setWindows(data.windows)
      setSelectedIndex(data.selectedIndex)
      setVisible(true)
    })
    window.alttab.onHide(() => {
      setVisible(false)
      setWindows([])
      setSelectedIndex(0)
    })
    window.alttab.onSelectionChanged(setSelectedIndex)
  }, [])

  if (!visible || windows.length === 0) return null

  const cornerBg = borderColor
    ? `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${borderColor} ${CORNER}px, ${borderColor} ${CORNER + 0.5}px, ${bg} ${CORNER + 0.5}px)`
    : `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${bg} ${CORNER}px)`
  const cornerBgRight = borderColor
    ? `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${borderColor} ${CORNER}px, ${borderColor} ${CORNER + 0.5}px, ${bg} ${CORNER + 0.5}px)`
    : `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${bg} ${CORNER}px)`

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ pointerEvents: "none" }}>
      <div className="menu-enter" style={{ marginTop: 24 }}>
        <div className="absolute top-0 right-full" style={{ width: CORNER, height: CORNER, background: cornerBg }} />
        <div className="absolute top-0 left-full" style={{ width: CORNER, height: CORNER, background: cornerBgRight }} />
        <div className="relative">
          <div
            className="overflow-hidden rounded-b-xl shadow-2xl p-3"
            style={{ backgroundColor: bg, transition: "background-color 300ms ease", maxWidth: "90vw" }}
          >
            <div className="flex flex-wrap justify-center gap-2">
              {windows.map((w, i) => (
                <WindowEntry key={w.hwnd} window={w} selected={i === selectedIndex} bg={bg} darkText={darkText} />
              ))}
            </div>
          </div>
          {borderColor && (
            <div
              style={{
                position: "absolute",
                top: CORNER,
                left: 0,
                right: 0,
                bottom: 0,
                borderLeft: `0.5px solid ${borderColor}`,
                borderRight: `0.5px solid ${borderColor}`,
                borderBottom: `0.5px solid ${borderColor}`,
                borderRadius: "0 0 12px 12px",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

const PRESET_COLORS = [
  { r: 48, g: 48, b: 48 },
  { r: 30, g: 30, b: 30 },
  { r: 20, g: 20, b: 20 },
  { r: 50, g: 50, b: 60 },
  { r: 40, g: 45, b: 55 },
  { r: 55, g: 45, b: 45 },
  { r: 45, g: 55, b: 45 },
  { r: 220, g: 220, b: 220 },
  { r: 235, g: 235, b: 235 },
  { r: 240, g: 235, b: 230 },
  { r: 225, g: 230, b: 240 },
  { r: 230, g: 225, b: 225 },
]

function colorMatch(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

export default function TopBarPage() {
  const [override, setOverride] = useState<{ r: number; g: number; b: number } | null>(null)
  const [palette, setPalette] = useState<{ r: number; g: number; b: number; darkText: boolean }[]>([])
  const [searchIcon, setSearchIcon] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.topbar.colorOverride().then((c) => {
      setOverride(c)
      setLoaded(true)
    })
    window.topbar.colorPalette().then(setPalette)
    window.topbar.searchIcon().then(setSearchIcon)
  }, [])

  async function selectColor(color: { r: number; g: number; b: number } | null) {
    setOverride(color)
    await window.topbar.setColorOverride(color)
  }

  const isAuto = override === null

  if (!loaded) return null

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Top Bar</h1>
        <p className="text-sm text-white/50 mt-1">Choose the top bar color.</p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Color</span>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => selectColor(null)}
            className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-colors ${
              isAuto ? 'border-white' : 'border-white/10 hover:border-white/30'
            }`}
            style={{
              background: 'conic-gradient(from 0deg, #f55, #ff5, #5f5, #5ff, #55f, #f5f, #f55)',
            }}
            title="Automatic (from wallpaper)"
          >
            {isAuto && <Check size={16} strokeWidth={3} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />}
          </button>

          {PRESET_COLORS.map((c, i) => {
            const selected = !isAuto && colorMatch(c, override)
            return (
              <button
                key={i}
                onClick={() => selectColor(c)}
                className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-colors ${
                  selected ? 'border-white' : 'border-white/10 hover:border-white/30'
                }`}
                style={{ backgroundColor: `rgb(${c.r},${c.g},${c.b})` }}
              >
                {selected && <Check size={16} strokeWidth={3} className={c.r + c.g + c.b > 400 ? 'text-black' : 'text-white'} />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">Search icon</span>
          <p className="text-sm text-white/50 mt-0.5">Show the search button in the top bar.</p>
        </div>
        <button
          onClick={() => {
            const next = !searchIcon
            setSearchIcon(next)
            window.topbar.setSearchIcon(next)
          }}
          className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${searchIcon ? 'bg-white' : 'bg-white/20'}`}
        >
          <div className={`w-4 h-4 rounded-full transition-transform mx-0.5 ${searchIcon ? 'translate-x-3.5 bg-neutral-950' : 'translate-x-0 bg-white/60'}`} />
        </button>
      </div>

      {palette.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">From wallpaper</span>
          <div className="flex flex-wrap gap-2">
            {palette.map((c, i) => {
              const selected = !isAuto && colorMatch(c, override)
              return (
                <button
                  key={i}
                  onClick={() => selectColor({ r: c.r, g: c.g, b: c.b })}
                  className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-colors ${
                    selected ? 'border-white' : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: `rgb(${c.r},${c.g},${c.b})` }}
                >
                  {selected && <Check size={16} strokeWidth={3} className={c.darkText ? 'text-black' : 'text-white'} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

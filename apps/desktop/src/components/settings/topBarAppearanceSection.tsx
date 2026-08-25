import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'

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

export default function TopBarAppearanceSection() {
  const [colorOverride, setColorOverride] = useState<{ r: number; g: number; b: number } | null>(null)
  const [palette, setPalette] = useState<{ r: number; g: number; b: number; darkText: boolean }[]>([])
  const [searchIcon, setSearchIcon] = useState(false)
  const [showVisualizer, setShowVisualizer] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      window.topbar.colorOverride(),
      window.topbar.colorPalette(),
      window.topbar.searchIcon(),
      window.topbar.mediaVisualizer?.() ?? Promise.resolve(false),
    ]).then(([c, pal, si, mv]) => {
      setColorOverride(c)
      setPalette(pal)
      setSearchIcon(si)
      setShowVisualizer(mv)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  async function selectColor(color: { r: number; g: number; b: number } | null) {
    setColorOverride(color)
    await window.topbar.setColorOverride(color)
  }

  function toggleSearchIcon(value: boolean) {
    setSearchIcon(value)
    window.topbar.setSearchIcon(value)
  }

  function toggleVisualizer(value: boolean) {
    setShowVisualizer(value)
    window.topbar.setMediaVisualizer?.(value)
  }

  if (!loaded) return null
  const isAuto = colorOverride === null

  return (
    <>
      <Section title="Color">
        <div className="flex flex-col gap-4">
          <div>
            <span className="mb-2 block text-eyebrow uppercase text-ink-quiet">Presets</span>
            <div className="flex flex-wrap gap-2">
              <Swatch
                onClick={() => selectColor(null)}
                selected={isAuto}
                title="Automatic"
                gradient="conic-gradient(from 0deg, #f55, #ff5, #5f5, #5ff, #55f, #f5f, #f55)"
              />
              {PRESET_COLORS.map((c, i) => (
                <Swatch
                  key={i}
                  selected={!isAuto && colorMatch(c, colorOverride)}
                  onClick={() => selectColor(c)}
                  bg={`rgb(${c.r},${c.g},${c.b})`}
                  light={c.r + c.g + c.b > 400}
                />
              ))}
            </div>
          </div>

          {palette.length > 0 && (
            <div>
              <span className="mb-2 block text-eyebrow uppercase text-ink-quiet">From wallpaper</span>
              <div className="flex flex-wrap gap-2">
                {palette.map((c, i) => (
                  <Swatch
                    key={i}
                    selected={!isAuto && colorMatch(c, colorOverride)}
                    onClick={() => selectColor({ r: c.r, g: c.g, b: c.b })}
                    bg={`rgb(${c.r},${c.g},${c.b})`}
                    light={c.darkText}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Elements">
        <div className="flex flex-col gap-3">
          <Row label="Search icon" description="The search button in the bar. The hotkey works either way.">
            <Toggle label="Search icon" checked={searchIcon} onChange={toggleSearchIcon} />
          </Row>
          <Row label="Media visualizer" description="Show the audio bars instead of the playing app's icon.">
            <Toggle label="Media visualizer" checked={showVisualizer} onChange={toggleVisualizer} />
          </Row>
        </div>
      </Section>
    </>
  )
}

function Swatch({
  bg,
  gradient,
  selected,
  onClick,
  title,
  light,
}: {
  bg?: string
  gradient?: string
  selected: boolean
  onClick: () => void
  title?: string
  light?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`focus-ring flex h-9 w-9 cursor-pointer items-center justify-center rounded-field border-2 transition-colors ${
        selected ? 'border-focus-ring' : 'border-line-hairline hover:border-line-strong'
      }`}
      style={gradient ? { background: gradient } : { backgroundColor: bg }}
    >
      {selected && (
        <Check
          size={14}
          strokeWidth={3}
          className={light ? 'text-black' : 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'}
        />
      )}
    </button>
  )
}

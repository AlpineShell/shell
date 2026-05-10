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
  const [colorOverride, setColorOverride] = useState<{ r: number; g: number; b: number } | null>(null)
  const [palette, setPalette] = useState<{ r: number; g: number; b: number; darkText: boolean }[]>([])
  const [searchIcon, setSearchIcon] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      window.topbar.colorOverride(),
      window.topbar.colorPalette(),
      window.topbar.searchIcon(),
    ]).then(([c, pal, si]) => {
      setColorOverride(c)
      setPalette(pal)
      setSearchIcon(si)
      setLoaded(true)
    })
  }, [])

  async function selectColor(color: { r: number; g: number; b: number } | null) {
    setColorOverride(color)
    await window.topbar.setColorOverride(color)
  }

  function toggleSearchIcon(value: boolean) {
    setSearchIcon(value)
    window.topbar.setSearchIcon(value)
  }

  if (!loaded) return null
  const isAuto = colorOverride === null

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Top Bar</h1>

      <Section title="Color" subtitle="Pick a preset or use a color from your wallpaper.">
        <div className="flex flex-col gap-4">
          <div>
            <span className="block text-xs text-white/50 mb-2">Presets</span>
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
              <span className="block text-xs text-white/50 mb-2">From wallpaper</span>
              <div className="flex flex-wrap gap-2">
                {palette.map((c, i) => (
                  <Swatch
                    key={i}
                    selected={!isAuto && colorMatch(c, colorOverride)}
                    onClick={() => selectColor({ r: c.r, g: c.g, b: c.b })}
                    bg={`rgb(${c.r},${c.g},${c.b})`}
                    light={!c.darkText ? false : true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Icon">
        <ToggleRow
          label="Show search icon"
          description="Display the search button in the top bar. The hotkey still works either way."
          checked={searchIcon}
          onChange={toggleSearchIcon}
        />
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-white/50 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
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
      className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-colors ${
        selected ? 'border-white' : 'border-white/10 hover:border-white/30'
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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-white/50 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative rounded-full transition-colors cursor-pointer ${checked ? 'bg-white' : 'bg-white/15'}`}
        style={{ width: 36, height: 20 }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-all"
          style={{
            width: 16,
            height: 16,
            left: checked ? 18 : 2,
            backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)',
          }}
        />
      </button>
    </div>
  )
}

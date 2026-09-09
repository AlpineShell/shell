import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import RegistryPage from './registryPage'

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

const COLOR_GROUP = 'Color'

function colorMatch(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

export default function AppearancePage() {
  const slots: SettingsPageSlot[] = [
    {
      group: COLOR_GROUP,
      order: 2,
      replaces: ['topbar-color', 'topbar-color-automatic'],
      content: <TopBarColorPicker />,
    },
  ]

  return (
    <RegistryPage
      page="appearance"
      slots={slots}
      groupSubtitles={{ [COLOR_GROUP]: 'Pick a preset or use a color from your wallpaper.' }}
    />
  )
}

function TopBarColorPicker() {
  const [colorOverride, setColorOverride] = useState<{ r: number; g: number; b: number } | null>(null)
  const [palette, setPalette] = useState<TopBarColor[]>([])

  useEffect(() => {
    let alive = true
    const applyOverride = (color: TopBarColor | null) => { if (alive) setColorOverride(color) }
    const readOverride = () => window.topbar.colorOverride().then(applyOverride).catch(() => {})
    readOverride()
    window.topbar.colorPalette().then((colors) => { if (alive) setPalette(colors) }).catch(() => {})
    const unsubscribe = window.topbar.onColorChanged(readOverride)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  function selectColor(color: { r: number; g: number; b: number } | null) {
    setColorOverride(color)
    window.topbar.setColorOverride(color)
  }

  const isAutomatic = colorOverride === null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="mb-2 block text-eyebrow uppercase text-ink-quiet">Presets</span>
        <div className="flex flex-wrap gap-2">
          <Swatch
            onClick={() => selectColor(null)}
            selected={isAutomatic}
            title="Automatic"
            gradient="conic-gradient(from 0deg, #f55, #ff5, #5f5, #5ff, #55f, #f5f, #f55)"
          />
          {PRESET_COLORS.map((color, index) => (
            <Swatch
              key={index}
              selected={!isAutomatic && colorMatch(color, colorOverride)}
              onClick={() => selectColor(color)}
              bg={`rgb(${color.r},${color.g},${color.b})`}
              light={color.r + color.g + color.b > 400}
            />
          ))}
        </div>
      </div>

      {palette.length > 0 && (
        <div>
          <span className="mb-2 block text-eyebrow uppercase text-ink-quiet">From wallpaper</span>
          <div className="flex flex-wrap gap-2">
            {palette.map((color, index) => (
              <Swatch
                key={index}
                selected={!isAutomatic && colorMatch(color, colorOverride)}
                onClick={() => selectColor({ r: color.r, g: color.g, b: color.b })}
                bg={`rgb(${color.r},${color.g},${color.b})`}
                light={color.darkText}
              />
            ))}
          </div>
        </div>
      )}
    </div>
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

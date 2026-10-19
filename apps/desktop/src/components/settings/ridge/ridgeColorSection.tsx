import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Plus } from 'lucide-react'
import { Card, Section } from '@alpine/ui'
import { settingsEntry } from '../../../settings/registry'
import { useOutsidePointer } from '../../../hooks/useOutsidePointer'
import { entryRowContent } from '../registryRowContent'
import RidgeColorPicker from './ridgeColorPicker'
import { toHex } from './ridgeColorMath'

const SECTION_TITLE = 'Color'

const AUTOMATIC_LABEL = 'Automatic'

const MORE_COLORS_LABEL = 'More colors'

const AUTOMATIC_GRADIENT = 'conic-gradient(from 0deg, #f55, #ff5, #5f5, #5ff, #55f, #f5f, #f55)'

const ADAPT_TO_APPS_SETTING = 'topbar-adapt-to-apps'

const NO_DESCRIPTION = ''

const LIGHT_CHANNEL_SUM = 400

const PRESET_COLORS: RidgePresetColor[] = [
  { name: 'Graphite', color: { r: 48, g: 48, b: 48 } },
  { name: 'Charcoal', color: { r: 30, g: 30, b: 30 } },
  { name: 'Onyx', color: { r: 20, g: 20, b: 20 } },
  { name: 'Slate', color: { r: 50, g: 50, b: 60 } },
  { name: 'Dusk', color: { r: 40, g: 45, b: 55 } },
  { name: 'Midnight blue', color: { r: 30, g: 40, b: 60 } },
  { name: 'Deep teal', color: { r: 25, g: 55, b: 55 } },
  { name: 'Forest', color: { r: 35, g: 50, b: 40 } },
  { name: 'Moss', color: { r: 45, g: 55, b: 45 } },
  { name: 'Clay', color: { r: 55, g: 45, b: 45 } },
  { name: 'Espresso', color: { r: 55, g: 42, b: 35 } },
  { name: 'Aubergine', color: { r: 50, g: 35, b: 55 } },
  { name: 'Cloud', color: { r: 245, g: 245, b: 245 } },
  { name: 'Mist', color: { r: 235, g: 235, b: 235 } },
  { name: 'Silver', color: { r: 220, g: 220, b: 220 } },
  { name: 'Stone', color: { r: 205, g: 205, b: 200 } },
  { name: 'Frost', color: { r: 225, g: 230, b: 240 } },
  { name: 'Sky', color: { r: 215, g: 225, b: 238 } },
  { name: 'Mint', color: { r: 218, g: 234, b: 228 } },
  { name: 'Sage', color: { r: 215, g: 225, b: 215 } },
  { name: 'Linen', color: { r: 240, g: 235, b: 230 } },
  { name: 'Sand', color: { r: 232, g: 224, b: 210 } },
  { name: 'Blush', color: { r: 230, g: 225, b: 225 } },
  { name: 'Lavender', color: { r: 228, g: 224, b: 238 } },
]

function sameColor(first: RidgeRgb | null, second: RidgeRgb): boolean {
  return first !== null && first.r === second.r && first.g === second.g && first.b === second.b
}

function isLight({ r, g, b }: RidgeRgb): boolean {
  return r + g + b > LIGHT_CHANNEL_SUM
}

function checkClass(light: boolean): string {
  return light ? 'text-black' : 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'
}

function swatchBorder(selected: boolean): string {
  return selected ? 'border-focus-ring' : 'border-line-hairline hover:border-line-strong'
}

export default function RidgeColorSection() {
  const [override, setOverride] = useState<RidgeRgb | null>(null)
  const [palette, setPalette] = useState<TopBarColor[]>([])

  useEffect(() => {
    let alive = true
    const readOverride = () =>
      window.topbar
        .colorOverride()
        .then((color) => {
          if (alive) setOverride(color)
        })
        .catch(() => {})
    readOverride()
    window.topbar
      .colorPalette()
      .then((colors) => {
        if (alive) setPalette(colors)
      })
      .catch(() => {})
    const unsubscribe = window.topbar.onColorChanged(readOverride)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  function choose(color: RidgeRgb | null) {
    setOverride(color)
    window.topbar.setColorOverride(color)
  }

  const chosenElsewhere = override !== null && !palette.some((color) => sameColor(override, color)) ? override : null
  const pickerStartColor = override ?? palette[0] ?? PRESET_COLORS[0].color
  const adaptToApps = settingsEntry(ADAPT_TO_APPS_SETTING)

  return (
    <Section title={SECTION_TITLE}>
      <div className="flex flex-col gap-4">
        {adaptToApps && entryRowContent(adaptToApps, NO_DESCRIPTION, false, adaptToApps.description)}
        <div className="flex flex-wrap gap-2">
          <Swatch label={AUTOMATIC_LABEL} selected={override === null} onClick={() => choose(null)} background={AUTOMATIC_GRADIENT} light={false} />
          {palette.map((color, index) => (
            <Swatch
              key={toHex(color)}
              label={`Wallpaper color ${index + 1}`}
              selected={sameColor(override, color)}
              onClick={() => choose({ r: color.r, g: color.g, b: color.b })}
              background={toHex(color)}
              light={color.darkText}
            />
          ))}
          <PresetMenu color={chosenElsewhere} startColor={pickerStartColor} onPick={choose} />
        </div>
      </div>
    </Section>
  )
}

function Swatch({ label, selected, onClick, background, light }: RidgeSwatchProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={`focus-ring flex size-9 cursor-pointer items-center justify-center rounded-field border-2 transition-colors ${swatchBorder(selected)}`}
      style={{ background }}
    >
      {selected && <Check size={14} strokeWidth={3} className={checkClass(light)} />}
    </button>
  )
}

function PresetMenu({ color, startColor, onPick }: RidgePresetMenuProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useOutsidePointer(anchor, open, closeMenu)

  function closeMenu() {
    setOpen(false)
  }

  function pick(preset: RidgeRgb) {
    onPick(preset)
    setOpen(false)
  }

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div ref={anchor} className="relative" onKeyDown={closeOnEscape}>
      <button
        ref={trigger}
        type="button"
        aria-label={MORE_COLORS_LABEL}
        title={MORE_COLORS_LABEL}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={`focus-ring flex size-9 cursor-pointer items-center justify-center rounded-field border-2 transition-colors ${
          color ? 'border-focus-ring' : 'border-dashed border-line-strong hover:border-ink-quiet'
        }`}
        style={color ? { background: toHex(color) } : undefined}
      >
        {color ? <Check size={14} strokeWidth={3} className={checkClass(isLight(color))} /> : <Plus size={14} className="text-ink-quiet" />}
      </button>
      {open && (
        <div id={menuId} role="group" aria-label={MORE_COLORS_LABEL} className="absolute top-full left-0 z-40 mt-2 w-max">
          <Card className="flex flex-col gap-3 p-3">
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((preset) => (
                <Swatch
                  key={preset.name}
                  label={preset.name}
                  selected={sameColor(color, preset.color)}
                  onClick={() => pick(preset.color)}
                  background={toHex(preset.color)}
                  light={isLight(preset.color)}
                />
              ))}
            </div>
            <div className="border-t border-line-hairline pt-3">
              <RidgeColorPicker initial={startColor} onPick={onPick} />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { TextField } from '@alpine/ui'
import {
  fractionAlong,
  hsvToRgb,
  hueAt,
  hueFraction,
  parseHex,
  pureHue,
  rgbToHsv,
  shadeAt,
  steppedHue,
  steppedShade,
  toHex,
} from './ridgeColorMath'

const SHADE_LABEL = 'Saturation and brightness'

const HUE_LABEL = 'Hue'

const HEX_LABEL = 'Hex color'

const STARTING_HUE = 0

const HUE_GRADIENT = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'

const PRIMARY_BUTTON = 0

const PRIMARY_BUTTON_HELD = 1

function percent(fraction: number): number {
  return Math.round(fraction * 100)
}

function shadeBackground(hue: number): string {
  return `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${toHex(pureHue(hue))})`
}

function startDrag(event: PointerEvent<HTMLDivElement>): boolean {
  if (event.button !== PRIMARY_BUTTON) return false
  event.currentTarget.setPointerCapture?.(event.pointerId)
  return true
}

function isDragging(event: PointerEvent<HTMLDivElement>): boolean {
  return (event.buttons & PRIMARY_BUTTON_HELD) === PRIMARY_BUTTON_HELD
}

export default function RidgeColorPicker({ initial, onPick }: RidgeColorPickerProps) {
  const [hsv, setHsv] = useState(() => rgbToHsv(initial, STARTING_HUE))
  const [hexText, setHexText] = useState(() => toHex(initial))
  const color = toHex(hsvToRgb(hsv))

  function applyHsv(next: RidgeHsv) {
    const rgb = hsvToRgb(next)
    setHsv(next)
    setHexText(toHex(rgb))
    onPick(rgb)
  }

  function applyHexText(text: string) {
    setHexText(text)
    const rgb = parseHex(text)
    if (!rgb) return
    setHsv(rgbToHsv(rgb, hsv.h))
    onPick(rgb)
  }

  return (
    <div className="flex flex-col gap-3">
      <ShadeField hsv={hsv} onChange={applyHsv} />
      <HueSlider hue={hsv.h} onChange={(hue) => applyHsv({ ...hsv, h: hue })} />
      <TextField
        label={HEX_LABEL}
        value={hexText}
        onChange={applyHexText}
        onBlur={() => setHexText(color)}
        invalid={parseHex(hexText) === null}
        spellCheck={false}
        maxLength={7}
        icon={<span className="block size-3 rounded-full border border-line-strong" style={{ background: color }} />}
      />
    </div>
  )
}

function ShadeField({ hsv, onChange }: RidgeShadeFieldProps) {
  function pickAt(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = fractionAlong(event.clientX, bounds.left, bounds.width)
    const y = fractionAlong(event.clientY, bounds.top, bounds.height)
    onChange(shadeAt(hsv.h, x, y))
  }

  function stepWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    const next = steppedShade(hsv, event.key, event.shiftKey)
    if (!next) return
    event.preventDefault()
    onChange(next)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={SHADE_LABEL}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent(hsv.s)}
      aria-valuetext={`Saturation ${percent(hsv.s)}%, brightness ${percent(hsv.v)}%`}
      className="focus-ring relative h-32 w-full cursor-crosshair touch-none rounded-field"
      style={{ background: shadeBackground(hsv.h) }}
      onPointerDown={(event) => {
        if (startDrag(event)) pickAt(event)
      }}
      onPointerMove={(event) => {
        if (isDragging(event)) pickAt(event)
      }}
      onKeyDown={stepWithKeys}
    >
      <PickerThumb x={hsv.s} y={1 - hsv.v} color={toHex(hsvToRgb(hsv))} />
    </div>
  )
}

function HueSlider({ hue, onChange }: RidgeHueSliderProps) {
  function pickAt(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    onChange(hueAt(fractionAlong(event.clientX, bounds.left, bounds.width)))
  }

  function stepWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    const next = steppedHue(hue, event.key, event.shiftKey)
    if (next === null) return
    event.preventDefault()
    onChange(next)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={HUE_LABEL}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      className="focus-ring relative h-3 w-full cursor-pointer touch-none rounded-full"
      style={{ background: HUE_GRADIENT }}
      onPointerDown={(event) => {
        if (startDrag(event)) pickAt(event)
      }}
      onPointerMove={(event) => {
        if (isDragging(event)) pickAt(event)
      }}
      onKeyDown={stepWithKeys}
    >
      <PickerThumb x={hueFraction(hue)} y={0.5} color={toHex(pureHue(hue))} />
    </div>
  )
}

function PickerThumb({ x, y, color }: RidgePickerThumbProps) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.4)]"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: color }}
    />
  )
}

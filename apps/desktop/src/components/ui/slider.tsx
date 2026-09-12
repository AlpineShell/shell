import type { CSSProperties } from 'react'

export default function Slider({ min, max, step, value, onChange, label, suffix }: SliderProps) {
  const progress = `${((value - min) / (max - min)) * 100}%`
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(parseInt(event.target.value, 10))}
        className="focus-ring ui-slider w-44"
        style={{ '--slider-progress': progress } as CSSProperties}
      />
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-quiet">
        {value}
        {suffix}
      </span>
    </div>
  )
}

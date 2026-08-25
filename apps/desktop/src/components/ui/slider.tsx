export default function Slider({ min, max, step, value, onChange, label, suffix }: SliderProps) {
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
        className="focus-ring cursor-pointer accent-fill-solid"
      />
      <span className="w-10 text-right text-xs tabular-nums text-ink-quiet">
        {value}
        {suffix}
      </span>
    </div>
  )
}

export default function Segmented<T extends string | number>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex self-start rounded-full border border-line-hairline p-1"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`focus-ring cursor-pointer rounded-full px-3 py-1 text-dense transition-colors ${
              active ? 'bg-fill-solid text-on-solid' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

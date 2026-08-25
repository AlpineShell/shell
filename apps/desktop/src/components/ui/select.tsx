export default function Select<T extends string>({ options, value, onChange, label }: SelectProps<T>) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as T)}
      className="focus-ring h-8 cursor-pointer rounded-field border border-line-hairline bg-surface-2 px-2 text-dense text-ink-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

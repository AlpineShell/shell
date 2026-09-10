import { Search, X } from 'lucide-react'

export default function SearchField({
  value,
  onChange,
  label,
  placeholder,
  hint,
  onKeyDown,
  controls,
  activeDescendant,
  ref,
}: SearchFieldProps) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-field border border-line-hairline bg-surface-2 px-2.5 transition-colors focus-within:border-line-strong">
      <Search size={14} className="shrink-0 text-ink-faint" />
      <input
        ref={ref}
        type="text"
        role="combobox"
        value={value}
        aria-label={label}
        aria-expanded={value.trim().length > 0}
        aria-controls={controls}
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full min-w-0 bg-transparent text-dense text-ink-primary outline-none placeholder:text-ink-faint"
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="focus-ring flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-faint transition-colors hover:text-ink-primary"
        >
          <X size={12} />
        </button>
      ) : (
        hint && (
          <kbd aria-hidden className="shrink-0 font-mono text-eyebrow tracking-normal text-ink-faint">
            {hint}
          </kbd>
        )
      )}
    </div>
  )
}

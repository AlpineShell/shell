export default function TextField({
  value,
  onChange,
  label,
  placeholder,
  type = 'text',
  icon,
  invalid,
  onSubmit,
  className,
  ref,
}: TextFieldProps) {
  return (
    <div
      className={`flex h-8 items-center gap-2 rounded-field border bg-surface-2 px-3 transition-colors focus-within:border-line-strong ${
        invalid ? 'border-danger' : 'border-line-hairline'
      } ${className ?? ''}`}
    >
      {icon && <span className="shrink-0 text-ink-quiet">{icon}</span>}
      <input
        ref={ref}
        type={type}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit()
        }}
        className="w-full bg-transparent text-dense text-ink-primary outline-none placeholder:text-ink-faint"
      />
    </div>
  )
}

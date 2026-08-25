const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-fill-solid text-on-solid hover:bg-fill-solid-hover',
  outline: 'border border-line-hairline bg-surface-2 text-ink-primary hover:bg-fill-subtle',
  ghost: 'bg-transparent text-ink-primary hover:bg-fill-ghost',
  danger: 'bg-danger text-on-solid hover:bg-danger/85',
  dangerOutline: 'border border-danger/40 bg-transparent text-danger hover:bg-danger/10',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-dense',
  md: 'h-10 px-4 text-sm',
}

export default function Button({ onClick, children, variant = 'primary', size = 'md', disabled, className }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-full transition-colors disabled:pointer-events-none disabled:opacity-60 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

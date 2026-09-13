import Spinner from './spinner'

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost: 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary',
  danger: 'text-ink-quiet hover:bg-danger/10 hover:text-danger',
}

export default function IconButton({
  onClick,
  label,
  children,
  variant = 'ghost',
  busy,
  disabled,
  expanded,
  controls,
  className,
}: IconButtonProps) {
  const inert = disabled || busy
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      aria-busy={busy}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={label}
      title={label}
      className={`focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-field transition-colors ${
        inert ? 'cursor-not-allowed text-ink-faint' : `cursor-pointer ${VARIANT_CLASSES[variant]}`
      } ${className ?? ''}`}
    >
      {busy ? <Spinner size={15} /> : children}
    </button>
  )
}

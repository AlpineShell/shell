export default function IconButton({ onClick, label, children, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`focus-ring flex h-7 w-7 items-center justify-center rounded-field transition-colors ${
        disabled
          ? 'cursor-not-allowed text-ink-faint'
          : 'cursor-pointer text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
      }`}
    >
      {children}
    </button>
  )
}

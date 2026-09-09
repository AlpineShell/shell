export default function PickerTile({ onClick, label, selected, className, children }: PickerTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={`focus-ring relative flex cursor-pointer items-center justify-center overflow-hidden rounded-card border-2 transition-colors ${
        selected ? 'border-focus-ring' : 'border-line-hairline hover:border-line-strong'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

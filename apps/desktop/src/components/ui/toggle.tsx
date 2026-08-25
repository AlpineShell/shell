export default function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-fill-solid' : 'bg-fill-track'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
          checked ? 'left-[18px] bg-on-solid' : 'left-0.5 bg-surface-1'
        }`}
      />
    </button>
  )
}

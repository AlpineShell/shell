export default function Toggle({ checked, onChange, label, disabled, pending }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-state ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-fill-solid' : 'bg-fill-track'} ${pending ? 'ring-2 ring-warning/70' : ''}`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-[left,background-color] duration-200 ease-state ${
          checked ? 'left-[19px] bg-on-solid' : 'left-[3px] bg-toggle-knob'
        }`}
      />
    </button>
  )
}

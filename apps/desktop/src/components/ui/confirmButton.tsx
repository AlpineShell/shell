import { useState } from 'react'
import Button from './button'
import IconButton from './iconButton'

export default function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = 'outline',
  confirmVariant = 'danger',
  size = 'sm',
  icon,
  iconOnly,
  busy,
  disabled,
  className,
}: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)

  if (!asking && iconOnly) {
    return (
      <IconButton label={label} variant="danger" busy={busy} disabled={disabled} onClick={() => setAsking(true)}>
        {icon}
      </IconButton>
    )
  }

  if (!asking) {
    return (
      <Button
        variant={variant}
        size={size}
        icon={icon}
        busy={busy}
        disabled={disabled}
        className={className}
        onClick={() => setAsking(true)}
      >
        {label}
      </Button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Button variant="ghost" size={size} disabled={busy} onClick={() => setAsking(false)}>
        Cancel
      </Button>
      <Button
        variant={confirmVariant}
        size={size}
        busy={busy}
        className={className}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
    </span>
  )
}

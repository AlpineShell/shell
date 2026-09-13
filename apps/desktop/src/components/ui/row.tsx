const ROW_LAYOUT = {
  inline: 'items-center justify-between gap-4',
  stacked: 'flex-col gap-2',
}

const CONTROL_PLACEMENT = {
  inline: 'shrink-0',
  stacked: 'min-w-0',
}

function rowLayout(stacked: boolean | undefined): keyof typeof ROW_LAYOUT {
  return stacked ? 'stacked' : 'inline'
}

export default function Row({ label, description, disabled, stacked, children }: RowProps) {
  const layout = rowLayout(stacked)
  return (
    <div className={`flex ${ROW_LAYOUT[layout]} ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <div className="text-sm text-ink-primary">{label}</div>
        {description && <div className="mt-0.5 text-xs text-ink-quiet">{description}</div>}
      </div>
      {children && <div className={CONTROL_PLACEMENT[layout]}>{children}</div>}
    </div>
  )
}

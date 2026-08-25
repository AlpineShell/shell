export default function Row({ label, description, disabled, children }: RowProps) {
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <div className="text-sm text-ink-primary">{label}</div>
        {description && <div className="mt-0.5 text-xs text-ink-quiet">{description}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

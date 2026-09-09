export default function EmptyState({ icon, title, detail, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-line-hairline px-6 py-10 text-center">
      {icon && <span className="text-ink-faint">{icon}</span>}
      <span className="text-dense text-ink-secondary">{title}</span>
      {detail && <span className="text-xs text-ink-quiet">{detail}</span>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

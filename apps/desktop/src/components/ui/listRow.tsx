import { ChevronDown } from 'lucide-react'
import Card from './card'

export default function ListRow({
  icon,
  title,
  badges,
  detail,
  actions,
  onActivate,
  activateLabel,
  expanded,
  disabled,
  muted,
  children,
}: ListRowProps) {
  const body = (
    <>
      {icon && <span className="flex w-7 shrink-0 justify-center">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate text-dense ${muted ? 'text-ink-quiet' : 'text-ink-primary'}`}>{title}</span>
          {badges}
        </span>
        {detail && <span className="truncate text-xs text-ink-quiet">{detail}</span>}
      </span>
      {expanded !== undefined && (
        <ChevronDown size={16} className={`shrink-0 text-ink-faint transition-transform ${expanded ? 'rotate-180' : ''}`} />
      )}
    </>
  )

  return (
    <Card className="group overflow-hidden">
      <div className="flex min-h-14 items-center">
        {onActivate ? (
          <button
            type="button"
            onClick={onActivate}
            disabled={disabled}
            aria-label={activateLabel}
            aria-expanded={expanded}
            className="focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch px-3 py-2 text-left transition-colors hover:bg-fill-ghost disabled:cursor-default"
          >
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">{body}</div>
        )}
        {actions && <div className="flex shrink-0 items-center gap-1.5 pr-3 pl-2">{actions}</div>}
      </div>
      {children}
    </Card>
  )
}

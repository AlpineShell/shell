const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-fill-ghost text-ink-quiet',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
}

export default function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  )
}

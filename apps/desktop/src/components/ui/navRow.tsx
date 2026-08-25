import { ChevronRight } from 'lucide-react'

export default function NavRow({ label, description, icon, onClick }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex h-16 cursor-pointer items-center gap-3 rounded-card border border-line-hairline bg-surface-2 px-4 text-left transition-colors hover:bg-fill-subtle"
    >
      {icon && <span className="shrink-0 text-ink-quiet">{icon}</span>}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-dense text-ink-primary">{label}</span>
        {description && <span className="text-xs text-ink-quiet">{description}</span>}
      </div>
      <ChevronRight size={16} className="shrink-0 text-ink-faint" />
    </button>
  )
}

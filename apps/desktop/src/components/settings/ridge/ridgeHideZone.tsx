import { EyeOff } from 'lucide-react'

function visibilityClass(active: boolean): string {
  return active ? 'opacity-100' : 'opacity-0'
}

function emphasisClass(targeted: boolean): string {
  return targeted ? 'border-danger bg-danger/10 text-danger' : 'border-line-strong bg-surface-2 text-ink-quiet'
}

export default function RidgeHideZone({ active, targeted, ref }: RidgeHideZoneProps) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-ridge-hide-zone
      data-active={active || undefined}
      data-targeted={targeted || undefined}
      className={`relative z-10 flex h-10 items-center justify-center gap-2 rounded-field border border-dashed text-dense transition-[opacity,background-color,border-color,color] duration-150 ${visibilityClass(active)} ${emphasisClass(targeted)}`}
    >
      <EyeOff size={14} />
      Drop here to hide
    </div>
  )
}

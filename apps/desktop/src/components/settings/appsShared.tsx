import { AppWindow, Loader2, Search } from 'lucide-react'
import PageTitle from '../ui/pageTitle'

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />
}

export function AppIcon({ icon, name, size = 28 }: { icon?: string | null; name: string; size?: number }) {
  if (icon) return <img src={icon} alt={name} draggable={false} className="shrink-0 object-contain" style={{ width: size, height: size }} />
  return (
    <div className="shrink-0 flex items-center justify-center rounded-md bg-surface-3 text-ink-faint" style={{ width: size, height: size }}>
      <AppWindow size={Math.round(size * 0.55)} strokeWidth={1.75} />
    </div>
  )
}

export function bandLabel(band: 'light' | 'moderate' | 'heavy'): string {
  return band === 'heavy' ? 'Heavy' : band === 'moderate' ? 'Moderate' : 'Light'
}

export function bandClass(band: 'light' | 'moderate' | 'heavy'): string {
  return band === 'heavy' ? 'text-warning' : 'text-ink-quiet'
}

export function processKey(target: string | null): string | null {
  if (!target) return null
  const base = target.split(/[\\/]/).pop() || ''
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 bg-surface-2 border border-line-hairline focus-within:border-line-strong transition-colors rounded-field h-8 px-3 w-56">
      <Search size={13} className="text-ink-quiet shrink-0" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent outline-none text-dense text-ink-primary placeholder:text-ink-faint w-full" />
    </div>
  )
}

export function PageHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <PageTitle title={title} subtitle={description} />
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  )
}

import { AppWindow, ChevronRight, Loader2, Search, type LucideIcon } from 'lucide-react'

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />
}

export function AppIcon({ icon, name, size = 28 }: { icon?: string | null; name: string; size?: number }) {
  if (icon) return <img src={icon} alt={name} draggable={false} className="shrink-0 object-contain" style={{ width: size, height: size }} />
  return (
    <div className="shrink-0 flex items-center justify-center rounded-md bg-white/8 text-white/35" style={{ width: size, height: size }}>
      <AppWindow size={Math.round(size * 0.55)} strokeWidth={1.75} />
    </div>
  )
}

export function bandLabel(band: 'light' | 'moderate' | 'heavy'): string {
  return band === 'heavy' ? 'Heavy' : band === 'moderate' ? 'Moderate' : 'Light'
}

export function bandClass(band: 'light' | 'moderate' | 'heavy'): string {
  return band === 'heavy' ? 'text-amber-300/80' : 'text-white/45'
}

export function processKey(target: string | null): string | null {
  if (!target) return null
  const base = target.split(/[\\/]/).pop() || ''
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}

export function Toggle({ checked, pending, onChange }: { checked: boolean; pending?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      aria-label={checked ? 'On' : 'Off'}
      className={`shrink-0 relative rounded-full transition-colors cursor-pointer ${checked ? 'bg-white' : 'bg-white/15'} ${pending ? 'ring-2 ring-amber-400/60' : ''}`}
      style={{ width: 36, height: 20 }}
    >
      <span className="absolute top-0.5 rounded-full transition-all" style={{ width: 16, height: 16, left: checked ? 18 : 2, backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)' }} />
    </button>
  )
}

export function NavRow({ icon: Icon, label, description, onClick }: { icon: LucideIcon; label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 h-16 rounded-lg bg-neutral-900 border border-white/5 hover:bg-neutral-800/80 cursor-pointer transition-colors text-left"
    >
      <Icon size={18} className="text-white/60 shrink-0" />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[13px] text-white/90">{label}</span>
        <span className="text-xs text-white/50">{description}</span>
      </div>
      <ChevronRight size={16} className="text-white/40 shrink-0" />
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 bg-neutral-900 border border-white/5 focus-within:border-white/20 transition-colors rounded-lg h-8 px-3 w-56">
      <Search size={13} className="text-white/50 shrink-0" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent outline-none text-[13px] placeholder:text-white/40 w-full" />
    </div>
  )
}

export function PageHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-white/50">{description}</p>
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  )
}

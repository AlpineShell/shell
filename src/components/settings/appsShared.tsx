import { useEffect, useState } from 'react'
import { AppWindow, Loader2, Search, SlidersHorizontal } from 'lucide-react'

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

export function formatMemory(bytes: number): string {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  return Math.round(mb) + ' MB'
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

export function useTechState(): [boolean, () => void] {
  const [tech, setTech] = useState(() => { try { return localStorage.getItem('apps.tech') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('apps.tech', tech ? '1' : '0') } catch {} }, [tech])
  return [tech, () => setTech((v) => !v)]
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

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-7 px-3 rounded-md text-[12px] cursor-pointer transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
      {children}
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

export function TechToggle({ tech, onToggle }: { tech: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] cursor-pointer transition-colors border ${tech ? 'bg-white/10 text-white border-white/10' : 'text-white/50 hover:text-white border-white/5 hover:bg-white/5'}`}
    >
      <SlidersHorizontal size={13} /> {tech ? 'Hide technical details' : 'Show technical details'}
    </button>
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

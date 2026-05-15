import { ChevronRight, RotateCcw } from 'lucide-react'

interface SystemPageProps {
  onNavigate: (path: string) => void
}

const ROWS = [
  {
    path: 'system/revert',
    label: 'Revert back to Windows',
    description: 'Switch back to Windows Explorer or fully remove Alpine Shell',
    icon: RotateCcw,
  },
]

export default function SystemPage({ onNavigate }: SystemPageProps) {
  return (
    <div className="w-full flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">System</h1>

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => {
          const Icon = row.icon
          return (
            <button
              key={row.path}
              onClick={() => onNavigate(row.path)}
              className="flex items-center gap-3 px-4 h-16 rounded-lg bg-neutral-900 border border-white/5 hover:bg-neutral-800/80 cursor-pointer transition-colors text-left"
            >
              <Icon size={18} className="text-white/60 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[13px] text-white/90">{row.label}</span>
                <span className="text-xs text-white/50">{row.description}</span>
              </div>
              <ChevronRight size={16} className="text-white/40 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

import { ChevronRight, Image as ImageIcon, Keyboard, LayoutGrid, PanelTop } from 'lucide-react'

interface PersonalizationHubProps {
  onNavigate: (path: string) => void
}

const ROWS = [
  { path: 'personalization/wallpaper', label: 'Wallpaper', description: 'Change background image', icon: ImageIcon },
  { path: 'personalization/topbar', label: 'Top Bar', description: 'Color, icon', icon: PanelTop },
  { path: 'personalization/tray', label: 'System Tray', description: 'Show, hide and reorder tray icons', icon: LayoutGrid },
  { path: 'personalization/hotkeys', label: 'Hotkeys', description: 'Function keys', icon: Keyboard },
]

export default function PersonalizationHub({ onNavigate }: PersonalizationHubProps) {
  return (
    <div className="w-full flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Personalization</h1>

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

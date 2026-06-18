import { Image as ImageIcon, Keyboard, LayoutDashboard, LayoutGrid, PanelTop } from 'lucide-react'
import { NavRow } from './appsShared'

interface PersonalizationHubProps {
  onNavigate: (path: string) => void
}

const ROWS = [
  { path: 'personalization/wallpaper', label: 'Wallpaper', description: 'Change background image', icon: ImageIcon },
  { path: 'personalization/topbar', label: 'Top Bar', description: 'Color, icon', icon: PanelTop },
  { path: 'personalization/tray', label: 'System Tray', description: 'Show, hide and reorder tray icons', icon: LayoutGrid },
  { path: 'personalization/hotkeys', label: 'Hotkeys', description: 'Function keys', icon: Keyboard },
  { path: 'personalization/tiling', label: 'Window Tiling', description: 'Snap and auto-arrange windows', icon: LayoutDashboard },
]

export default function PersonalizationHub({ onNavigate }: PersonalizationHubProps) {
  return (
    <div className="w-full flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Personalization</h1>

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <NavRow key={row.path} icon={row.icon} label={row.label} description={row.description} onClick={() => onNavigate(row.path)} />
        ))}
      </div>
    </div>
  )
}

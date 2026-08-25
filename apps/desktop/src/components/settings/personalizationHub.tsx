import { CalendarDays, Image as ImageIcon, Keyboard, LayoutDashboard, LayoutGrid, PanelTop } from 'lucide-react'
import PageTitle from '../ui/pageTitle'
import NavRow from '../ui/navRow'

interface PersonalizationHubProps {
  onNavigate: (path: string) => void
}

const ROWS = [
  { path: 'personalization/wallpaper', label: 'Wallpaper', description: 'Change background image', icon: ImageIcon },
  { path: 'personalization/topbar', label: 'Top Bar', description: 'Color, icon', icon: PanelTop },
  { path: 'personalization/calendar', label: 'Calendar', description: 'Google Calendar, clock format', icon: CalendarDays },
  { path: 'personalization/tray', label: 'System Tray', description: 'Show, hide and reorder tray icons', icon: LayoutGrid },
  { path: 'personalization/hotkeys', label: 'Hotkeys', description: 'Function keys', icon: Keyboard },
  { path: 'personalization/tiling', label: 'Window Tiling', description: 'Snap and auto-arrange windows', icon: LayoutDashboard },
]

export default function PersonalizationHub({ onNavigate }: PersonalizationHubProps) {
  return (
    <div className="w-full flex flex-col gap-4">
      <PageTitle title="Personalization" />

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => {
          const Icon = row.icon
          return (
            <NavRow
              key={row.path}
              icon={<Icon size={18} />}
              label={row.label}
              description={row.description}
              onClick={() => onNavigate(row.path)}
            />
          )
        })}
      </div>
    </div>
  )
}

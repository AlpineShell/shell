import {
  AppWindow,
  Info,
  Keyboard,
  LayoutDashboard,
  Monitor,
  PanelTop,
  Plug,
  Puzzle,
  RefreshCw,
  Search,
  Wallpaper,
} from 'lucide-react'

export const DEFAULT_SETTINGS_PAGE = 'topbar'

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'Appearance',
    items: [
      { path: 'topbar', label: 'Top Bar', icon: PanelTop },
      { path: 'desktop', label: 'Desktop', icon: Wallpaper },
      { path: 'displays', label: 'Displays', icon: Monitor },
    ],
  },
  {
    label: 'Behaviour',
    items: [
      { path: 'windows', label: 'Windows', icon: LayoutDashboard },
      { path: 'launcher', label: 'Launcher', icon: Search },
      { path: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    ],
  },
  {
    label: 'System',
    items: [
      { path: 'apps', label: 'Apps', icon: AppWindow },
      { path: 'devices', label: 'Devices', icon: Plug },
      { path: 'plugins', label: 'Plugins', icon: Puzzle },
      { path: 'updates', label: 'Updates', icon: RefreshCw },
      { path: 'about', label: 'About', icon: Info },
    ],
  },
]

export const SETTINGS_PAGE_LABELS: Record<string, string> = Object.fromEntries(
  SETTINGS_NAV.flatMap((group) => group.items.map((item) => [item.path, item.label]))
)

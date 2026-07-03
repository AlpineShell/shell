import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, AppWindow, House, Monitor, MonitorCog, Paintbrush, Plug, RefreshCw, X } from 'lucide-react'
import AboutPage from './aboutPage'
import PersonalizationHub from './personalizationHub'
import WallpaperPage from './wallpaperPage'
import TopBarPage from './topBarPage'
import CalendarPage from './calendarPage'
import TrayPage from './trayPage'
import TrayIconsPage from './trayIconsPage'
import HotkeysPage from './hotkeysPage'
import TilingPage from './tilingPage'
import DevicesHub from './devicesHub'
import BluetoothSettingsPage from './bluetoothSettingsPage'
import WifiSettingsPage from './wifiSettingsPage'
import SystemPage from './systemPage'
import SystemRevertPage from './systemRevertPage'
import AppsHub from './appsHub'
import AppsRunningPage from './appsRunningPage'
import AppsInstalledPage from './appsInstalledPage'
import AppsStartupPage from './appsStartupPage'
import UpdatesPage from './updatesPage'
import DisplaysPage from './displaysPage'

interface NavItem {
  path: string
  label: string
  icon: typeof House
}

const NAV: NavItem[] = [
  { path: 'home', label: 'Home', icon: House },
  { path: 'personalization', label: 'Personalization', icon: Paintbrush },
  { path: 'displays', label: 'Displays', icon: Monitor },
  { path: 'devices', label: 'Devices & Connections', icon: Plug },
  { path: 'apps', label: 'Apps', icon: AppWindow },
  { path: 'system', label: 'System', icon: MonitorCog },
  { path: 'updates', label: 'Updates', icon: RefreshCw },
]

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

export default function SettingsApp() {
  const [history, setHistory] = useState<string[]>(() => {
    const page = window.shell.windows.initialPage
    return page && page !== 'home' ? ['home', page] : ['home']
  })
  const [historyIndex, setHistoryIndex] = useState(() => history.length - 1)

  const currentPath = history[historyIndex]
  const segments = currentPath.split('/')
  const topSegment = segments[0]
  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1

  function navigate(path: string) {
    if (path === currentPath) return
    const next = history.slice(0, historyIndex + 1)
    next.push(path)
    setHistory(next)
    setHistoryIndex(next.length - 1)
  }

  function back() {
    if (canBack) setHistoryIndex(historyIndex - 1)
  }

  function forward() {
    if (canForward) setHistoryIndex(historyIndex + 1)
  }

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    return window.shell.windows.onSettingsNavigate((page) => navigateRef.current(page))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        window.launcher.show()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const leaf = segments[segments.length - 1]
    window.shell.windows.setSettingsPage(SEGMENT_LABELS[leaf] ?? leaf)
  }, [currentPath])

  return (
    <div className="settings-scope w-screen h-screen bg-neutral-950 text-white flex overflow-hidden">
      <aside className="w-56 shrink-0 flex flex-col bg-neutral-900" style={dragRegion}>
        <div className="h-14 flex items-center px-5 shrink-0">
          <span className="text-base font-semibold tracking-tight">Settings</span>
        </div>
        <nav className="flex-1 px-2 flex flex-col gap-0.5 overflow-auto" style={noDragRegion}>
          {NAV.map((p) => {
            const Icon = p.icon
            const active = p.path === topSegment
            return (
              <button
                key={p.path}
                onClick={() => navigate(p.path)}
                className={`flex items-center gap-2.5 px-3 h-9 rounded-md text-left text-[13px] cursor-pointer transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={15} className={active ? 'opacity-90' : 'opacity-60'} />
                {p.label}
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col bg-neutral-900">
        <div className="h-14 flex items-center shrink-0 bg-neutral-900" style={dragRegion}>
          <header className="w-full h-10 flex items-center gap-3 pl-3 pr-3">
            <div className="flex items-center gap-1" style={noDragRegion}>
              <button
                onClick={back}
                disabled={!canBack}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  canBack ? 'hover:bg-white/10 cursor-pointer text-white' : 'text-white/30 cursor-not-allowed'
                }`}
                aria-label="Back"
              >
                <ArrowLeft size={15} />
              </button>
              <button
                onClick={forward}
                disabled={!canForward}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  canForward ? 'hover:bg-white/10 cursor-pointer text-white' : 'text-white/30 cursor-not-allowed'
                }`}
                aria-label="Forward"
              >
                <ArrowRight size={15} />
              </button>
            </div>

            <div style={noDragRegion}>
              <Breadcrumb path={currentPath} onNavigate={navigate} />
            </div>

            <div className="flex-1" />

            <button
              onClick={() => window.shell.windows.closeSettings()}
              className="w-7 h-7 flex items-center justify-center cursor-pointer text-white/60 hover:text-white transition-colors"
              style={noDragRegion}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </header>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-5 pt-5 pb-6 bg-neutral-950 rounded-tl-xl">
          <PageErrorBoundary key={currentPath}>
            <PageRouter path={currentPath} navigate={navigate} />
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  )
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[settings] page render error:', error)
  }
  render() {
    if (this.state.failed) {
      return <div className="text-sm text-white/50">This page failed to load. Try reopening Settings or restarting the shell.</div>
    }
    return this.props.children
  }
}

function PageRouter({ path, navigate }: { path: string; navigate: (p: string) => void }) {
  if (path === 'home') return <AboutPage onNavigate={navigate} />
  if (path === 'personalization') return <PersonalizationHub onNavigate={navigate} />
  if (path === 'personalization/wallpaper') return <WallpaperPage />
  if (path === 'personalization/topbar') return <TopBarPage />
  if (path === 'personalization/calendar') return <CalendarPage />
  if (path === 'personalization/tray') return <TrayPage onNavigate={navigate} />
  if (path === 'personalization/tray/icons') return <TrayIconsPage />
  if (path === 'personalization/hotkeys') return <HotkeysPage />
  if (path === 'personalization/tiling') return <TilingPage />
  if (path === 'displays') return <DisplaysPage />
  if (path === 'devices') return <DevicesHub onNavigate={navigate} />
  if (path === 'devices/bluetooth') return <BluetoothSettingsPage />
  if (path === 'devices/wifi') return <WifiSettingsPage />
  if (path === 'apps') return <AppsHub onNavigate={navigate} />
  if (path === 'apps/running') return <AppsRunningPage />
  if (path === 'apps/installed') return <AppsInstalledPage />
  if (path === 'apps/startup') return <AppsStartupPage />
  if (path === 'system') return <SystemPage onNavigate={navigate} />
  if (path === 'system/revert') return <SystemRevertPage />
  if (path === 'updates') return <UpdatesPage />
  return null
}

const SEGMENT_LABELS: Record<string, string> = {
  home: 'Home',
  apps: 'Apps',
  running: 'Running',
  installed: 'Installed',
  startup: 'Startup',
  personalization: 'Personalization',
  displays: 'Displays',
  wallpaper: 'Wallpaper',
  topbar: 'Top Bar',
  calendar: 'Calendar',
  tray: 'System Tray',
  icons: 'Manage Icons',
  hotkeys: 'Hotkeys',
  tiling: 'Window Tiling',
  devices: 'Devices & Connections',
  bluetooth: 'Bluetooth',
  wifi: 'Wi-Fi',
  system: 'System',
  revert: 'Revert back to Windows',
  updates: 'Updates',
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const segments = path.split('/')
  return (
    <div className="flex items-center gap-1 select-none">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        const subpath = segments.slice(0, i + 1).join('/')
        const label = SEGMENT_LABELS[seg] ?? seg
        return (
          <span key={subpath} className="flex items-center gap-1">
            {i > 0 && <span className="text-white/30 text-[13px]">/</span>}
            {isLast ? (
              <span className="text-[13px] underline decoration-white/30 underline-offset-4">{label}</span>
            ) : (
              <button
                onClick={() => onNavigate(subpath)}
                className="text-[13px] text-white/60 hover:text-white hover:underline underline-offset-4 decoration-white/30 cursor-pointer"
              >
                {label}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

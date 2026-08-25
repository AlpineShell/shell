import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import TopBarPage from './topBarPage'
import DesktopPage from './desktopPage'
import DisplaysPage from './displaysPage'
import WindowsPage from './windowsPage'
import LauncherPage from './launcherPage'
import ShortcutsPage from './shortcutsPage'
import AppsPage from './appsPage'
import DevicesPage from './devicesPage'
import PluginsPage from './pluginsPage'
import UpdatesPage from './updatesPage'
import AboutPage from './aboutPage'
import { DEFAULT_SETTINGS_PAGE, SETTINGS_NAV, SETTINGS_PAGE_LABELS } from './settingsNav'
import { FlyoutHostContext } from '../ui/flyoutHost'
import { useTheme } from '../../hooks/useTheme'

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

export default function SettingsApp() {
  useTheme()

  const [history, setHistory] = useState<string[]>(() => {
    const page = window.shell.windows.initialPage
    return page && page !== DEFAULT_SETTINGS_PAGE ? [DEFAULT_SETTINGS_PAGE, page] : [DEFAULT_SETTINGS_PAGE]
  })
  const [historyIndex, setHistoryIndex] = useState(() => history.length - 1)
  const [flyoutHost, setFlyoutHost] = useState<HTMLElement | null>(null)

  const currentPath = history[historyIndex]
  const currentPage = currentPath.split('/')[0]
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
    return window.shell.windows.onSettingsReset((page) => {
      setHistory([page])
      setHistoryIndex(0)
    })
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
    window.shell.windows.setSettingsPage(SETTINGS_PAGE_LABELS[currentPage] ?? currentPage)
  }, [currentPage])

  return (
    <div className="settings-scope flex h-screen w-screen overflow-hidden bg-surface-1 text-ink-primary">
      <aside className="flex w-56 shrink-0 flex-col bg-surface-0" style={dragRegion}>
        <div className="flex h-14 shrink-0 items-center px-5">
          <span className="font-display text-base font-normal tracking-tight text-ink-primary">Settings</span>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-auto px-2 pb-4" style={noDragRegion}>
          {SETTINGS_NAV.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1 text-eyebrow uppercase text-ink-faint">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = item.path === currentPage
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`focus-ring flex h-9 cursor-pointer items-center gap-2.5 rounded-field px-3 text-left text-dense transition-colors ${
                      active ? 'bg-surface-3 font-medium text-ink-primary' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
                    }`}
                  >
                    <Icon size={15} className={active ? 'opacity-90' : 'opacity-60'} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-surface-0">
        <div className="flex h-14 shrink-0 items-center bg-surface-0" style={dragRegion}>
          <header className="flex h-10 w-full items-center gap-3 px-3">
            <div className="flex items-center gap-1" style={noDragRegion}>
              <button
                onClick={back}
                disabled={!canBack}
                className={`focus-ring flex h-7 w-7 items-center justify-center rounded-field transition-colors ${
                  canBack ? 'cursor-pointer text-ink-primary hover:bg-fill-ghost' : 'cursor-not-allowed text-ink-faint'
                }`}
                aria-label="Back"
              >
                <ArrowLeft size={15} />
              </button>
              <button
                onClick={forward}
                disabled={!canForward}
                className={`focus-ring flex h-7 w-7 items-center justify-center rounded-field transition-colors ${
                  canForward ? 'cursor-pointer text-ink-primary hover:bg-fill-ghost' : 'cursor-not-allowed text-ink-faint'
                }`}
                aria-label="Forward"
              >
                <ArrowRight size={15} />
              </button>
            </div>

            <span className="select-none text-dense text-ink-quiet">{SETTINGS_PAGE_LABELS[currentPage] ?? currentPage}</span>

            <div className="flex-1" />

            <button
              onClick={() => window.shell.windows.closeSettings()}
              className="focus-ring flex h-7 w-7 cursor-pointer items-center justify-center rounded-field text-ink-quiet transition-colors hover:text-ink-primary"
              style={noDragRegion}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </header>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-tl-card border-t border-l border-line-hairline bg-surface-1">
          <div className="h-full overflow-auto px-gutter pt-gutter pb-6">
            <PageErrorBoundary key={currentPath}>
              <FlyoutHostContext.Provider value={flyoutHost}>
                <PageRouter path={currentPath} />
              </FlyoutHostContext.Provider>
            </PageErrorBoundary>
          </div>
          <div ref={setFlyoutHost} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" />
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
      return <div className="text-sm text-ink-quiet">This page failed to load. Try reopening Settings or restarting the shell.</div>
    }
    return this.props.children
  }
}

function PageRouter({ path }: { path: string }) {
  const [page, tab] = path.split('/')
  if (page === 'topbar') return <TopBarPage />
  if (page === 'desktop') return <DesktopPage />
  if (page === 'displays') return <DisplaysPage />
  if (page === 'windows') return <WindowsPage />
  if (page === 'launcher') return <LauncherPage />
  if (page === 'shortcuts') return <ShortcutsPage />
  if (page === 'apps') return <AppsPage initialTab={tab} />
  if (page === 'devices') return <DevicesPage initialTab={tab} />
  if (page === 'plugins') return <PluginsPage />
  if (page === 'updates') return <UpdatesPage />
  if (page === 'about') return <AboutPage />
  return null
}

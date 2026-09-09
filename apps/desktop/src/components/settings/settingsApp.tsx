import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { SETTINGS_PAGES, SETTINGS_SECTIONS, settingsPageByRoute } from '../../settings/registry'
import { SETTINGS_ROUTES } from './settingsRoutes'
import { useTheme } from '../../hooks/useTheme'

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

interface NavSection {
  id: SettingsSectionId
  label: string
  pages: SettingsPage[]
}

function navSections(): NavSection[] {
  return [...SETTINGS_SECTIONS]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      id: section.id,
      label: section.label,
      pages: SETTINGS_PAGES.filter(
        (page) => page.section === section.id && page.route !== null && !page.route.includes('/')
      ).sort((a, b) => a.order - b.order),
    }))
    .filter((section) => section.pages.length > 0)
}

function routeLabel(route: string): string {
  return settingsPageByRoute(route)?.label ?? route
}

export default function SettingsApp() {
  useTheme()

  const [history, setHistory] = useState<string[]>(() => {
    const page = window.shell.windows.initialPage
    return page && page !== 'home' ? ['home', page] : ['home']
  })
  const [historyIndex, setHistoryIndex] = useState(() => history.length - 1)

  const currentPath = history[historyIndex]
  const topSegment = currentPath.split('/')[0]
  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1
  const sections = navSections()

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

  useEffect(() => {
    navigateRef.current = navigate
  })

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
    window.shell.windows.setSettingsPage(routeLabel(currentPath))
  }, [currentPath])

  return (
    <div className="settings-scope flex h-screen w-screen overflow-hidden bg-surface-1 text-ink-primary">
      <aside className="flex w-56 shrink-0 flex-col bg-surface-0" style={dragRegion}>
        <div className="h-14 flex items-center px-5 shrink-0">
          <span className="font-display text-base font-normal tracking-tight text-ink-primary">Settings</span>
        </div>
        <nav className="flex-1 px-2 pb-3 flex flex-col gap-0.5 overflow-auto" style={noDragRegion}>
          {sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-0.5">
              {section.pages.length > 1 && (
                <span className="px-3 pt-3 pb-1 text-eyebrow uppercase text-ink-faint select-none">{section.label}</span>
              )}
              {section.pages.map((page) => {
                const Icon = page.icon
                const active = page.route === topSegment
                return (
                  <button
                    key={page.id}
                    onClick={() => navigate(page.route as string)}
                    className={`focus-ring flex h-9 cursor-pointer items-center gap-2.5 rounded-field px-3 text-left text-dense transition-colors ${
                      active ? 'bg-surface-3 font-medium text-ink-primary' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
                    }`}
                  >
                    <Icon size={15} className={active ? 'opacity-90' : 'opacity-60'} />
                    {page.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-surface-0">
        <div className="flex h-14 shrink-0 items-center bg-surface-0" style={dragRegion}>
          <header className="w-full h-10 flex items-center gap-3 pl-3 pr-3">
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

            <div style={noDragRegion}>
              <Breadcrumb path={currentPath} onNavigate={navigate} />
            </div>

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

        <div className="min-h-0 flex-1 overflow-auto rounded-tl-card border-t border-l border-line-hairline bg-surface-1 px-gutter pt-gutter pb-6">
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
      return <div className="text-sm text-ink-quiet">This page failed to load. Try reopening Settings or restarting the shell.</div>
    }
    return this.props.children
  }
}

function PageRouter({ path, navigate }: { path: string; navigate: (p: string) => void }) {
  return <>{SETTINGS_ROUTES[path]?.(navigate) ?? null}</>
}

function breadcrumbTrail(path: string): string[] {
  const segments = path.split('/')
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'))
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const trail = breadcrumbTrail(path)
  return (
    <div className="flex items-center gap-1 select-none">
      {trail.map((subpath, index) => {
        const isLast = index === trail.length - 1
        return (
          <span key={subpath} className="flex items-center gap-1">
            {index > 0 && <span className="text-dense text-ink-faint">/</span>}
            {isLast ? (
              <span className="text-dense text-ink-primary underline decoration-line-strong underline-offset-4">{routeLabel(subpath)}</span>
            ) : (
              <button
                onClick={() => onNavigate(subpath)}
                className="focus-ring cursor-pointer text-dense text-ink-quiet underline-offset-4 decoration-line-strong hover:text-ink-primary hover:underline"
              >
                {routeLabel(subpath)}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

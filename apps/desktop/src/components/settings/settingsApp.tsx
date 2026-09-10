import { Component, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { SETTINGS_PAGES, SETTINGS_SECTIONS, settingsPageByRoute } from '../../settings/registry'
import { SETTINGS_SEARCH_LIMIT, searchSettings } from '../../settings/settingsSearch'
import { SETTINGS_ROUTES } from './settingsRoutes'
import SettingsSearchResults from './settingsSearchResults'
import SearchField from '../ui/searchField'
import { highlightSetting } from '../../hooks/useHighlightedSetting'
import { toggleSettingsValue } from '../../hooks/useSettingsValue'
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
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const currentPath = history[historyIndex]
  const topSegment = currentPath.split('/')[0]
  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1
  const sections = navSections()

  const ranked = useMemo(() => searchSettings(query), [query])
  const matches = useMemo(() => ranked.slice(0, SETTINGS_SEARCH_LIMIT), [ranked])
  const searching = query.trim().length > 0
  const selected = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1)

  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const rowBase = useId()
  const rowId = (index: number) => `${rowBase}-${index}`

  function clearSearch() {
    setQuery('')
    setActiveIndex(0)
  }

  function navigate(path: string) {
    clearSearch()
    if (path === currentPath) return
    const next = history.slice(0, historyIndex + 1)
    next.push(path)
    setHistory(next)
    setHistoryIndex(next.length - 1)
  }

  function back() {
    clearSearch()
    if (canBack) setHistoryIndex(historyIndex - 1)
  }

  function forward() {
    clearSearch()
    if (canForward) setHistoryIndex(historyIndex + 1)
  }

  function activateMatch(target: SettingsSearchTarget) {
    const action = target.action
    if (action.kind === 'toggle') {
      toggleSettingsValue(action.entry)
      return
    }
    if (action.kind === 'launcher') {
      clearSearch()
      window.launcher.show()
      return
    }
    if (action.highlight) highlightSetting(action.highlight)
    navigate(action.route)
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      clearSearch()
      searchRef.current?.blur()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((selected + step + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const match = matches[selected]
      if (match) activateMatch(match.target)
    }
  }

  const navigateRef = useRef(navigate)

  useEffect(() => {
    navigateRef.current = navigate
  })

  useEffect(() => {
    return window.shell.windows.onSettingsNavigate((page) => navigateRef.current(page))
  }, [])

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key.toLowerCase() !== 'k') return
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    window.shell.windows.setSettingsPage(routeLabel(currentPath))
  }, [currentPath])

  useEffect(() => {
    scrollRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, matches])

  return (
    <div className="settings-scope flex h-screen w-screen overflow-hidden bg-surface-1 text-ink-primary">
      <aside className="flex w-56 shrink-0 flex-col bg-surface-0" style={dragRegion}>
        <div className="h-14 flex items-center px-5 shrink-0">
          <span className="font-display text-base font-normal tracking-tight text-ink-primary">Settings</span>
        </div>
        <div className="px-2 pb-1 shrink-0" style={noDragRegion}>
          <SearchField
            ref={searchRef}
            value={query}
            onChange={(next) => {
              setQuery(next)
              setActiveIndex(0)
            }}
            onKeyDown={onSearchKey}
            label="Search settings"
            placeholder="Search settings"
            hint="Ctrl K"
            controls={searching ? listId : undefined}
            activeDescendant={selected >= 0 ? rowId(selected) : undefined}
          />
        </div>
        <nav className="flex-1 px-2 pb-3 flex flex-col gap-0.5 overflow-auto" style={noDragRegion}>
          {sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-0.5">
              {section.pages.length > 1 && (
                <span className="px-3 pt-3 pb-1 text-eyebrow uppercase text-ink-faint select-none">{section.label}</span>
              )}
              {section.pages.map((page) => {
                const Icon = page.icon
                const active = page.route === topSegment && !searching
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

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto rounded-tl-card border-t border-l border-line-hairline bg-surface-1 px-gutter pt-gutter pb-6"
        >
          <div className={searching ? 'hidden' : ''}>
            <PageErrorBoundary key={currentPath}>
              <PageRouter path={currentPath} navigate={navigate} />
            </PageErrorBoundary>
          </div>
          {searching && (
            <SettingsSearchResults
              query={query}
              matches={matches}
              total={ranked.length}
              selected={selected}
              listId={listId}
              rowId={rowId}
              onPoint={setActiveIndex}
              onActivate={activateMatch}
            />
          )}
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

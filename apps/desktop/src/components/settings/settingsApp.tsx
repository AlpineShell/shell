import { Component, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, Puzzle } from 'lucide-react'
import { SearchField } from '@alpine/ui'
import { SETTINGS_PAGES, SETTINGS_SECTIONS, settingsPageByRoute } from '../../settings/registry'
import { SETTINGS_SEARCH_LIMIT, searchSettings } from '../../settings/settingsSearch'
import { pluginIdFromSettingsRoute } from '../../plugins/pluginSettingsPages'
import { SETTINGS_ROUTE_PAGES, settingsRouteView } from './settingsRoutes'
import SettingsSearchResults from './settingsSearchResults'
import { highlightSetting } from '../../hooks/useHighlightedSetting'
import { toggleSettingsValue } from '../../hooks/useSettingsValue'
import { usePluginSettingsPages } from '../../hooks/usePluginSettingsPages'
import { useTheme } from '../../hooks/useTheme'

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties
const titleBarArea = { height: 'env(titlebar-area-height, 40px)', width: 'env(titlebar-area-width, 100%)' }

const NO_PLUGIN_PAGES: PluginSettingsPageEntry[] = []

const PLUGIN_NAV_LABEL = 'Plugins'

const PLUGIN_PAGES_SECTION: SettingsSectionId = 'system'

const FALLBACK_SECTION: SettingsSectionId = 'home'

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

function routeLabel(route: string, pluginPages: PluginSettingsPageEntry[]): string {
  return settingsPageByRoute(route)?.label ?? pluginPages.find((page) => page.route === route)?.label ?? route
}

function pageShownAt(path: string): SettingsPage | null {
  const aliased = SETTINGS_ROUTE_PAGES[path]
  return settingsPageByRoute(aliased ?? path) ?? settingsPageByRoute(path.split('/')[0])
}

function sectionOfPath(path: string): SettingsSectionId {
  const section = pageShownAt(path)?.section
  if (section) return section
  return pluginIdFromSettingsRoute(path) === null ? FALLBACK_SECTION : PLUGIN_PAGES_SECTION
}

function parentPath(path: string): string | null {
  const segments = path.split('/')
  return segments.length > 1 ? segments.slice(0, -1).join('/') : null
}

export default function SettingsApp() {
  useTheme()

  const pluginPages = usePluginSettingsPages() ?? NO_PLUGIN_PAGES
  const [history, setHistory] = useState<string[]>(() => {
    const page = window.shell.windows.initialPage
    return page && page !== 'home' ? ['home', page] : ['home']
  })
  const [historyIndex, setHistoryIndex] = useState(() => history.length - 1)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const lastPathInSection = useRef<Partial<Record<SettingsSectionId, string>>>({})

  const currentPath = history[historyIndex]
  const topSegment = currentPath.split('/')[0]
  const activeSectionId = sectionOfPath(currentPath)
  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1
  const sections = navSections()
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0]
  const sidebarPluginPages = pluginPages.filter((page) => page.topLevel)
  const pagePluginList = activeSectionId === PLUGIN_PAGES_SECTION ? sidebarPluginPages : NO_PLUGIN_PAGES

  const ranked = useMemo(() => searchSettings(query), [query])
  const matches = useMemo(() => ranked.slice(0, SETTINGS_SEARCH_LIMIT), [ranked])
  const searching = query.trim().length > 0
  const selected = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1)
  const pluginPageActive = !searching && sidebarPluginPages.some((page) => page.route === currentPath)

  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const rowBase = useId()
  const rowId = (index: number) => `${rowBase}-${index}`

  useEffect(() => {
    lastPathInSection.current[activeSectionId] = currentPath
  }, [activeSectionId, currentPath])

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

  function openSection(section: NavSection) {
    navigate(lastPathInSection.current[section.id] ?? (section.pages[0].route as string))
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
    window.shell.windows.setSettingsPage(routeLabel(currentPath, pluginPages))
  }, [currentPath, pluginPages])

  useEffect(() => {
    scrollRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, matches])

  return (
    <div className="settings-scope flex h-screen w-screen flex-col overflow-hidden bg-surface-0 text-ink-primary">
      <header className="flex shrink-0 items-center gap-1 pl-3" style={{ ...dragRegion, ...titleBarArea }}>
        <div className="flex items-center gap-1" style={noDragRegion}>
          <HistoryButton label="Back" enabled={canBack} onClick={back}>
            <ArrowLeft size={15} />
          </HistoryButton>
          <HistoryButton label="Forward" enabled={canForward} onClick={forward}>
            <ArrowRight size={15} />
          </HistoryButton>
        </div>
        <nav aria-label="Sections" className="ml-2 flex items-center gap-0.5" style={noDragRegion}>
          {sections.map((section) => (
            <SectionTab
              key={section.id}
              label={section.label}
              active={!searching && section.id === activeSection.id}
              onClick={() => openSection(section)}
            />
          ))}
        </nav>
        <div className="ml-auto mr-2 w-64 min-w-0 shrink" style={noDragRegion}>
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
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label={activeSection.label} className="flex w-56 shrink-0 flex-col gap-0.5 overflow-auto px-2 pt-1 pb-3">
          {activeSection.pages.map((page) => {
            const Icon = page.icon
            const active = page.route === topSegment && !searching && !pluginPageActive
            return (
              <SettingsNavButton
                key={page.id}
                label={page.label}
                active={active}
                icon={<Icon size={15} className={active ? 'opacity-90' : 'opacity-60'} />}
                onClick={() => navigate(page.route as string)}
              />
            )
          })}
          <PluginPagesNav pages={pagePluginList} activeRoute={searching ? null : currentPath} onNavigate={navigate} />
        </nav>

        <main
          ref={scrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable] rounded-tl-card border-t border-l border-line-hairline bg-surface-1 px-gutter pt-gutter pb-6"
        >
          <div className={searching ? 'hidden' : 'flex min-h-full flex-col'}>
            <ParentLink path={currentPath} pluginPages={pluginPages} onNavigate={navigate} />
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
        </main>
      </div>
    </div>
  )
}

function HistoryButton({ label, enabled, onClick, children }: SettingsHistoryButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      className={`focus-ring flex h-7 w-7 items-center justify-center rounded-field transition-colors ${
        enabled ? 'cursor-pointer text-ink-primary hover:bg-fill-ghost' : 'cursor-not-allowed text-ink-faint'
      }`}
      aria-label={label}
    >
      {children}
    </button>
  )
}

function SectionTab({ label, active, onClick }: SettingsSectionTabProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring h-7 cursor-pointer rounded-field px-3 text-dense transition-colors ${
        active ? 'bg-surface-3 font-medium text-ink-primary' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
      }`}
    >
      {label}
    </button>
  )
}

function SettingsNavButton({ label, active, icon, onClick }: SettingsNavButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-field px-3 text-left text-dense transition-colors ${
        active ? 'bg-surface-3 font-medium text-ink-primary' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function PluginPagesNav({ pages, activeRoute, onNavigate }: PluginPagesNavProps) {
  if (pages.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-3 pt-3 pb-1 text-eyebrow uppercase text-ink-faint select-none">{PLUGIN_NAV_LABEL}</span>
      {pages.map((page) => {
        const active = page.route === activeRoute
        return (
          <SettingsNavButton
            key={page.route}
            label={page.label}
            active={active}
            icon={<PluginPageIcon page={page} active={active} />}
            onClick={() => onNavigate(page.route)}
          />
        )
      })}
    </div>
  )
}

function PluginPageIcon({ page, active }: PluginPageIconProps) {
  const opacity = active ? 'opacity-90' : 'opacity-60'
  if (page.iconUrl) return <img src={page.iconUrl} alt="" className={`size-[15px] shrink-0 rounded-sm object-contain ${opacity}`} />
  return <Puzzle size={15} className={opacity} />
}

function ParentLink({ path, pluginPages, onNavigate }: SettingsParentLinkProps) {
  const parent = parentPath(path)
  if (parent === null) return null
  return (
    <button
      onClick={() => onNavigate(parent)}
      className="focus-ring mb-3 inline-flex cursor-pointer items-center gap-0.5 self-start rounded-field pr-1.5 text-dense text-ink-quiet transition-colors hover:text-ink-primary"
    >
      <ChevronLeft size={14} />
      {routeLabel(parent, pluginPages)}
    </button>
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
  return <>{settingsRouteView(path)?.(navigate) ?? null}</>
}

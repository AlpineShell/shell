import { Component, Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Puzzle } from 'lucide-react'
import { SearchField } from '@alpine/ui'
import { SETTINGS_SECTIONS, settingsPageByRoute } from '../../settings/registry'
import {
  groupHoldingRoute,
  settingsSidebarSections,
  showsAsGroup,
  sidebarItemLabel,
} from '../../settings/settingsSidebar'
import { SETTINGS_SEARCH_LIMIT, searchSettings } from '../../settings/settingsSearch'
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

const OPEN_GROUPS_KEY = 'settings.openGroups'

const SECTION_IDS = new Set<string>(SETTINGS_SECTIONS.map((section) => section.id))

function isSectionId(value: unknown): value is SettingsSectionId {
  return typeof value === 'string' && SECTION_IDS.has(value)
}

function readOpenGroups(): SettingsSectionId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSectionId) : []
  } catch {
    return []
  }
}

function writeOpenGroups(groups: ReadonlySet<SettingsSectionId>) {
  try {
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...groups]))
  } catch {
    return
  }
}

function routeLabel(route: string, pluginPages: PluginSettingsPageEntry[]): string {
  return settingsPageByRoute(route)?.label ?? pluginPages.find((page) => page.route === route)?.label ?? route
}

function pageShownAt(path: string): SettingsPage | null {
  const aliased = SETTINGS_ROUTE_PAGES[path]
  return settingsPageByRoute(aliased ?? path) ?? settingsPageByRoute(path.split('/')[0])
}

function sidebarRouteOf(path: string, sidebar: SettingsSidebarSection[]): string | null {
  if (sidebar.some((sidebarSection) => sidebarSection.items.some((item) => item.route === path))) return path
  const route = pageShownAt(path)?.route
  return route ? route.split('/')[0] : null
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
  const [runFailure, setRunFailure] = useState<SettingsSearchRunFailure | null>(null)
  const sidebar = useMemo(() => settingsSidebarSections(pluginPages), [pluginPages])
  const [openGroups, setOpenGroups] = useState<ReadonlySet<SettingsSectionId>>(() => {
    const opened = new Set(readOpenGroups())
    const initialGroup = groupHoldingRoute(sidebarRouteOf(history[history.length - 1], sidebar), sidebar)
    if (initialGroup) opened.add(initialGroup)
    return opened
  })

  const currentPath = history[historyIndex]
  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1

  const ranked = useMemo(() => searchSettings(query), [query])
  const matches = useMemo(() => ranked.slice(0, SETTINGS_SEARCH_LIMIT), [ranked])
  const searching = query.trim().length > 0
  const selected = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1)
  const activeRoute = searching ? null : sidebarRouteOf(currentPath, sidebar)

  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const rowBase = useId()
  const rowId = (index: number) => `${rowBase}-${index}`

  function clearSearch() {
    setQuery('')
    setActiveIndex(0)
    setRunFailure(null)
  }

  function runFromSearch(target: SettingsSearchTarget, run: () => Promise<unknown>) {
    setRunFailure(null)
    run().catch((error: unknown) => {
      setRunFailure({ targetId: target.id, message: error instanceof Error ? error.message : String(error) })
    })
  }

  function changeOpenGroups(next: ReadonlySet<SettingsSectionId>) {
    setOpenGroups(next)
    writeOpenGroups(next)
  }

  function toggleGroup(id: SettingsSectionId) {
    const next = new Set(openGroups)
    if (!next.delete(id)) next.add(id)
    changeOpenGroups(next)
  }

  function revealInSidebar(path: string) {
    const group = groupHoldingRoute(sidebarRouteOf(path, sidebar), sidebar)
    if (group && !openGroups.has(group)) changeOpenGroups(new Set([...openGroups, group]))
  }

  function navigate(path: string) {
    clearSearch()
    if (path === currentPath) return
    revealInSidebar(path)
    const next = history.slice(0, historyIndex + 1)
    next.push(path)
    setHistory(next)
    setHistoryIndex(next.length - 1)
  }

  function moveInHistory(index: number) {
    revealInSidebar(history[index])
    setHistoryIndex(index)
  }

  function back() {
    clearSearch()
    if (canBack) moveInHistory(historyIndex - 1)
  }

  function forward() {
    clearSearch()
    if (canForward) moveInHistory(historyIndex + 1)
  }

  function activateMatch(target: SettingsSearchTarget) {
    const action = target.action
    if (action.kind === 'toggle') {
      toggleSettingsValue(action.entry)
      return
    }
    if (action.kind === 'run') {
      runFromSearch(target, action.run)
      return
    }
    if (action.kind === 'update-channel') {
      void window.shell.updates.setPreferences({ channel: action.channel }).then(
        () => navigate('updates'),
        () => navigate('updates')
      )
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
        <div className="ml-auto mr-2 w-64 min-w-0 shrink" style={noDragRegion}>
          <SearchField
            ref={searchRef}
            value={query}
            onChange={(next) => {
              setQuery(next)
              setActiveIndex(0)
              setRunFailure(null)
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
        <nav aria-label="Settings" className="flex w-56 shrink-0 flex-col gap-0.5 overflow-auto px-2 pt-1 pb-3">
          {sidebar.map((sidebarSection) =>
            showsAsGroup(sidebarSection) ? (
              <SidebarGroup
                key={sidebarSection.section.id}
                sidebarSection={sidebarSection}
                open={openGroups.has(sidebarSection.section.id)}
                activeRoute={activeRoute}
                onToggle={() => toggleGroup(sidebarSection.section.id)}
                onNavigate={navigate}
              />
            ) : (
              <Fragment key={sidebarSection.section.id}>
                {sidebarSection.items.map((item) => (
                  <SidebarItem
                    key={item.route}
                    item={item}
                    label={sidebarItemLabel(item, false)}
                    active={item.route === activeRoute}
                    nested={false}
                    onNavigate={navigate}
                  />
                ))}
                {sidebarSection.section.sidebar === 'pages' && <div aria-hidden className="h-2.5 shrink-0" />}
              </Fragment>
            )
          )}
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
              runFailure={runFailure}
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

function SidebarGroup({ sidebarSection, open, activeRoute, onToggle, onNavigate }: SettingsSidebarGroupProps) {
  const { section, items } = sidebarSection
  const Icon = section.icon
  const holdsActivePage = !open && items.some((item) => item.route === activeRoute)
  return (
    <>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={`focus-ring flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-field pr-2 pl-3 text-left text-dense transition-colors hover:bg-fill-ghost hover:text-ink-primary ${
          holdsActivePage ? 'font-medium text-ink-primary' : 'text-ink-secondary'
        }`}
      >
        <Icon size={15} className={holdsActivePage ? 'opacity-90' : 'opacity-60'} />
        {section.label}
        <ChevronRight size={13} className={`ml-auto text-ink-faint transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open &&
        items.map((item) => (
          <SidebarItem
            key={item.route}
            item={item}
            label={sidebarItemLabel(item, true)}
            active={item.route === activeRoute}
            nested
            onNavigate={onNavigate}
          />
        ))}
    </>
  )
}

function SidebarItem({ item, label, active, nested, onNavigate }: SettingsSidebarItemButtonProps) {
  return (
    <button
      onClick={() => onNavigate(item.route)}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring flex shrink-0 cursor-pointer items-center gap-2.5 rounded-field pr-3 text-left text-dense transition-colors ${
        nested ? 'h-8 pl-[37px]' : 'h-9 pl-3'
      } ${active ? 'bg-surface-3 font-medium text-ink-primary' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'}`}
    >
      {!nested && <SidebarItemIcon item={item} active={active} />}
      {label}
    </button>
  )
}

function SidebarItemIcon({ item, active }: SettingsSidebarItemIconProps) {
  if (item.kind === 'plugin-page') return <PluginPageIcon page={item.page} active={active} />
  const Icon = item.page.icon
  return <Icon size={15} className={active ? 'opacity-90' : 'opacity-60'} />
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

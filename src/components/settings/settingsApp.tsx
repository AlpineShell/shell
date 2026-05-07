import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Command, Info, Paintbrush, Keyboard, Search, X } from 'lucide-react'
import AboutPage from './aboutPage'
import PersonalizationPage from './personalizationPage'
import HotkeysPage from './hotkeysPage'

type PageId = 'about' | 'personalization' | 'hotkeys'

interface PageDef {
  id: PageId
  label: string
  icon: typeof Info
}

const PAGES: PageDef[] = [
  { id: 'about', label: 'About', icon: Info },
  { id: 'personalization', label: 'Personalization', icon: Paintbrush },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
]

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

export default function SettingsApp() {
  const [history, setHistory] = useState<PageId[]>(['about'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const currentId = history[historyIndex]
  const currentPage = PAGES.find((p) => p.id === currentId) ?? PAGES[0]
  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1

  function navigate(id: PageId) {
    if (id === currentId) return
    const next = history.slice(0, historyIndex + 1)
    next.push(id)
    setHistory(next)
    setHistoryIndex(next.length - 1)
  }

  function back() {
    if (canBack) setHistoryIndex(historyIndex - 1)
  }

  function forward() {
    if (canForward) setHistoryIndex(historyIndex + 1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filteredPages = search.trim()
    ? PAGES.filter((p) => p.label.toLowerCase().includes(search.toLowerCase()))
    : PAGES

  return (
    <div className="w-screen h-screen bg-neutral-950 text-white flex overflow-hidden">
      <aside className="w-56 shrink-0 flex flex-col border-r border-white/5 bg-neutral-950" style={dragRegion}>
        <div className="h-20 flex items-center px-5 shrink-0">
          <span className="text-xl font-semibold tracking-tight">Settings</span>
        </div>
        <nav className="flex-1 px-2 pt-3 flex flex-col gap-0.5 overflow-auto" style={noDragRegion}>
          {filteredPages.map((p) => {
            const Icon = p.icon
            const active = p.id === currentId
            return (
              <button
                key={p.id}
                onClick={() => navigate(p.id)}
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

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="h-20 px-5 flex items-center shrink-0" style={dragRegion}>
          <header
            className="w-full h-12 flex items-center gap-3 pl-3 pr-2 rounded-2xl bg-neutral-900"
          >
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
            <span className="text-[13px] underline decoration-white/30 underline-offset-4 select-none">
              {currentPage.label}
            </span>

            <div className="flex-1" />

            <div
              className="flex items-center gap-2 hover:bg-white/4 focus-within:bg-white/6 transition-colors rounded-lg h-8 px-3"
              style={noDragRegion}
            >
              <Search size={13} className="text-white/60 shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="bg-transparent outline-none text-[13px] placeholder:text-white/60 w-20 focus:w-40 transition-[width]"
              />
              <kbd className="font-sans text-white/50 bg-white/6 rounded h-5 px-1.5 inline-flex items-center justify-center gap-1 shrink-0 text-[11px] leading-none">
                <Command size={11} strokeWidth={2.25} />
                <span>K</span>
              </kbd>
            </div>

            <button
              onClick={() => window.shell.windows.closeSettings()}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 cursor-pointer transition-colors"
              style={noDragRegion}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </header>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-5 pt-3 pb-6">
          {currentId === 'about' && <AboutPage />}
          {currentId === 'personalization' && <PersonalizationPage />}
          {currentId === 'hotkeys' && <HotkeysPage />}
        </div>
      </main>
    </div>
  )
}

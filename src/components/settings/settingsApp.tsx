import { useState } from 'react'
import { X } from 'lucide-react'
import CustomizationPage from './customizationPage'

type Page = 'customization' | 'appearance' | 'about'

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

const pages: { id: Page; label: string }[] = [
  { id: 'customization', label: 'Customization' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
]

export default function SettingsApp() {
  const [page, setPage] = useState<Page>('customization')

  return (
    <div className="w-screen h-screen bg-neutral-950 text-white flex flex-col overflow-hidden">
      <div className="h-9 flex items-center justify-between px-3 shrink-0 border-b border-white/5" style={dragRegion}>
        <span className="text-xs text-white/60 font-medium">Settings</span>
        <button
          onClick={() => window.shell.windows.closeSettings()}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={noDragRegion}
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <nav className="w-52 shrink-0 border-r border-white/5 p-2 flex flex-col gap-0.5">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`text-left px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                page === p.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 overflow-auto p-6">
          {page === 'customization' && <CustomizationPage />}
        </div>
      </div>
    </div>
  )
}

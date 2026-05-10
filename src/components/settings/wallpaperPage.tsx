import { useEffect, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useWallpaper } from '../../hooks/useWallpaper'

type Tab = 'mine' | 'marketplace'

interface WallpaperItem {
  name: string
  path: string
  thumbnail: string
}

export default function WallpaperPage() {
  const wallpaper = useWallpaper()
  const [tab, setTab] = useState<Tab>('mine')
  const [mine, setMine] = useState<WallpaperItem[]>([])
  const [presets, setPresets] = useState<WallpaperItem[]>([])
  const [loadedMine, setLoadedMine] = useState(false)
  const [loadedPresets, setLoadedPresets] = useState(false)

  function refreshMine() {
    window.shell.windows.wallpaperMine().then((list) => {
      setMine(list)
      setLoadedMine(true)
    })
  }

  useEffect(() => {
    refreshMine()
    window.shell.windows.wallpaperPresets().then((list) => {
      setPresets(list)
      setLoadedPresets(true)
    })
  }, [])

  async function uploadWallpaper() {
    const newPath = await window.shell.windows.pickWallpaper()
    if (newPath) refreshMine()
  }

  async function applyWallpaper(p: WallpaperItem) {
    await window.shell.windows.setWallpaper(p.path)
  }

  async function deleteMine(p: WallpaperItem) {
    const ok = await window.shell.windows.wallpaperMineDelete(p.path)
    if (ok) refreshMine()
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Wallpaper</h1>
        <div className="inline-flex items-center bg-neutral-900 border border-white/5 rounded-lg p-0.5">
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>Mine</TabButton>
          <TabButton active={tab === 'marketplace'} onClick={() => setTab('marketplace')}>Marketplace</TabButton>
        </div>
      </div>

      {tab === 'mine' && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={uploadWallpaper}
            className="w-44 aspect-video rounded-lg bg-neutral-900 border border-white/10 hover:border-white/30 hover:bg-neutral-800/80 transition-colors flex items-center justify-center gap-2 cursor-pointer text-white/70 hover:text-white"
          >
            <Upload size={15} />
            <span className="text-[13px]">Upload</span>
          </button>

          {!loadedMine
            ? [0, 1, 2].map((i) => (
                <div key={i} className="w-44 aspect-video rounded-lg bg-neutral-900 border border-white/5 animate-pulse" />
              ))
            : mine.map((p) => (
                <WallpaperTile
                  key={p.path}
                  src={p.thumbnail}
                  selected={wallpaper === p.thumbnail}
                  onClick={() => applyWallpaper(p)}
                  onDelete={() => deleteMine(p)}
                />
              ))}
        </div>
      )}

      {tab === 'marketplace' && (
        <div className="flex flex-wrap gap-3">
          {!loadedPresets ? (
            [0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-44 aspect-video rounded-lg bg-neutral-900 border border-white/5 animate-pulse" />
            ))
          ) : presets.length === 0 ? (
            <div className="text-sm text-white/50 py-6">
              No presets yet. Drop image files into the <code className="px-1 bg-white/5 rounded text-white/70">wallpapers/</code> folder of the project.
            </div>
          ) : (
            presets.map((p) => (
              <WallpaperTile
                key={p.path}
                src={p.thumbnail}
                label={p.name}
                onClick={() => applyWallpaper(p)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-3 rounded-md text-[12px] cursor-pointer transition-colors ${
        active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function WallpaperTile({
  src,
  label,
  selected,
  onClick,
  onDelete,
}: {
  src: string
  label?: string
  selected?: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div
      className={`group relative w-44 aspect-video rounded-lg overflow-hidden bg-neutral-900 border-2 transition-colors ${
        selected ? 'border-white' : 'border-white/10 hover:border-white/30'
      }`}
    >
      <button
        onClick={onClick}
        className="block w-full h-full cursor-pointer"
      >
        <img src={src} alt={label ?? ''} className="w-full h-full object-cover" draggable={false} />
        {label && (
          <div className="absolute left-0 right-0 bottom-0 px-2 py-1 bg-linear-to-t from-black/70 to-transparent">
            <span className="text-[11px] text-white truncate block text-left">{label}</span>
          </div>
        )}
      </button>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity cursor-pointer"
          aria-label="Delete wallpaper"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

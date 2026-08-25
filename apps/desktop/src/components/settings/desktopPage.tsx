import { useEffect, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useWallpaper } from '../../hooks/useWallpaper'
import PageTitle from '../ui/pageTitle'
import Segmented from '../ui/segmented'

type Tab = 'mine' | 'marketplace'

const TABS: { value: Tab; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'marketplace', label: 'Marketplace' },
]

interface WallpaperItem {
  name: string
  path: string
  thumbnail: string
  url: string
}

const MINE_CACHE = 'alpine.wallpapers.mine'
const PRESETS_CACHE = 'alpine.wallpapers.presets'

function readCache(key: string): WallpaperItem[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeCache(key: string, list: WallpaperItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {}
}

export default function DesktopPage() {
  const wallpaper = useWallpaper()
  const [tab, setTab] = useState<Tab>('mine')
  const cachedMine = readCache(MINE_CACHE)
  const cachedPresets = readCache(PRESETS_CACHE)
  const [mine, setMine] = useState<WallpaperItem[]>(cachedMine ?? [])
  const [presets, setPresets] = useState<WallpaperItem[]>(cachedPresets ?? [])
  const [loadedMine, setLoadedMine] = useState(cachedMine !== null)
  const [loadedPresets, setLoadedPresets] = useState(cachedPresets !== null)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  function refreshMine() {
    window.shell.windows.wallpaperMine().then((list) => {
      const sliced = list.map(({ name, path, thumbnail, url }) => ({ name, path, thumbnail, url }))
      setMine(sliced)
      setLoadedMine(true)
      writeCache(MINE_CACHE, sliced)
    })
  }

  useEffect(() => {
    refreshMine()
    window.shell.windows.wallpaperPresets().then((list) => {
      setPresets(list)
      setLoadedPresets(true)
      writeCache(PRESETS_CACHE, list)
    })
  }, [])

  useEffect(() => {
    if (pendingPath && wallpaper) {
      const match = [...mine, ...presets].find((w) => w.path === pendingPath)
      if (match && match.url === wallpaper) setPendingPath(null)
    }
  }, [pendingPath, wallpaper, mine, presets])

  function isSelected(p: WallpaperItem) {
    if (pendingPath) return p.path === pendingPath
    return wallpaper === p.url
  }

  async function uploadWallpaper() {
    const newPath = await window.shell.windows.pickWallpaper()
    if (newPath) refreshMine()
  }

  async function applyWallpaper(p: WallpaperItem) {
    setPendingPath(p.path)
    await window.shell.windows.setWallpaper(p.path)
  }

  async function deleteMine(p: WallpaperItem) {
    const ok = await window.shell.windows.wallpaperMineDelete(p.path)
    if (ok) refreshMine()
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex items-center justify-between">
        <PageTitle title="Desktop" />
        <Segmented label="Wallpaper source" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'mine' && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={uploadWallpaper}
            className="focus-ring w-44 aspect-video rounded-card bg-surface-2 border border-line-hairline hover:border-line-strong hover:bg-surface-3 transition-colors flex items-center justify-center gap-2 cursor-pointer text-ink-secondary hover:text-ink-primary"
          >
            <Upload size={15} />
            <span className="text-dense">Upload</span>
          </button>

          {!loadedMine
            ? [0, 1, 2].map((i) => (
                <div key={i} className="w-44 aspect-video rounded-card bg-surface-2 border border-line-hairline animate-pulse" />
              ))
            : mine.map((p) => (
                <WallpaperTile
                  key={p.path}
                  src={p.thumbnail}
                  selected={isSelected(p)}
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
              <div key={i} className="w-44 aspect-video rounded-card bg-surface-2 border border-line-hairline animate-pulse" />
            ))
          ) : presets.length === 0 ? (
            <div className="text-sm text-ink-quiet py-6">
              No presets yet. Drop image files into the <code className="px-1 bg-fill-ghost rounded font-mono text-ink-primary">wallpapers/</code> folder of the project.
            </div>
          ) : (
            presets.map((p) => (
              <WallpaperTile
                key={p.path}
                src={p.thumbnail}
                label={p.name}
                selected={isSelected(p)}
                onClick={() => applyWallpaper(p)}
              />
            ))
          )}
        </div>
      )}
    </div>
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
      className={`group relative w-44 aspect-video rounded-card overflow-hidden bg-surface-2 border-2 transition-colors ${
        selected ? 'border-focus-ring' : 'border-line-hairline hover:border-line-strong'
      }`}
    >
      <button
        onClick={onClick}
        className="focus-ring block w-full h-full cursor-pointer"
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
          className="focus-ring absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity cursor-pointer"
          aria-label="Delete wallpaper"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

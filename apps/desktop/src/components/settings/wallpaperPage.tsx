import { useEffect, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { ConfirmButton, PageHeader, PickerTile, Segmented, type SegmentedOption } from '@alpine/ui'
import { useWallpaper } from '../../hooks/useWallpaper'

type Tab = 'mine' | 'presets'

const TABS: SegmentedOption<Tab>[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'presets', label: 'Presets' },
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
  } catch {
    return
  }
}

export default function WallpaperPage() {
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
    <div className="flex w-full flex-col gap-5">
      <PageHeader title="Wallpaper">
        <Segmented label="Wallpaper source" options={TABS} value={tab} onChange={setTab} />
      </PageHeader>

      {tab === 'mine' && (
        <div className="flex flex-wrap gap-3">
          <PickerTile
            label="Upload a wallpaper"
            onClick={uploadWallpaper}
            className="aspect-video w-44 gap-2 bg-surface-2 text-ink-secondary hover:bg-surface-3 hover:text-ink-primary"
          >
            <Upload size={15} />
            <span className="text-dense">Upload</span>
          </PickerTile>

          {!loadedMine
            ? [0, 1, 2].map((i) => <TileSkeleton key={i} />)
            : mine.map((p) => (
                <WallpaperTile
                  key={p.path}
                  name={p.name}
                  src={p.thumbnail}
                  selected={isSelected(p)}
                  onClick={() => applyWallpaper(p)}
                  onDelete={() => deleteMine(p)}
                />
              ))}
        </div>
      )}

      {tab === 'presets' && (
        <div className="flex flex-wrap gap-3">
          {!loadedPresets ? (
            [0, 1, 2, 3, 4, 5].map((i) => <TileSkeleton key={i} />)
          ) : presets.length === 0 ? (
            <div className="py-6 text-sm text-ink-quiet">No presets yet.</div>
          ) : (
            presets.map((p) => (
              <WallpaperTile
                key={p.path}
                name={p.name}
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

function TileSkeleton() {
  return <div className="aspect-video w-44 animate-pulse rounded-card border border-line-hairline bg-surface-2" />
}

function WallpaperTile({
  name,
  src,
  label,
  selected,
  onClick,
  onDelete,
}: {
  name: string
  src: string
  label?: string
  selected?: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div className="group relative">
      <PickerTile label={name} selected={selected} onClick={onClick} className="aspect-video w-44 bg-surface-2">
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
        {label && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/70 to-transparent px-2 py-1 text-left text-xs text-white">
            {label}
          </span>
        )}
      </PickerTile>
      {onDelete && (
        <div className="absolute top-1.5 right-1.5 rounded-field bg-surface-1/90 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <ConfirmButton
            iconOnly
            confirmOnly
            label="Delete wallpaper"
            confirmLabel="Delete"
            icon={<Trash2 size={14} />}
            onConfirm={onDelete}
          />
        </div>
      )}
    </div>
  )
}

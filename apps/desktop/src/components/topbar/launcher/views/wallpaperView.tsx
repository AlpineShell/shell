import { useEffect, useMemo, useRef, useState } from "react"
import { useWallpaper } from "../../../../hooks/useWallpaper"
import { scoreField } from "../../../../lib/launcherSearch"
import { launcherColors } from "../launcherColors"

const TILE_WIDTH = 200
const TILE_GAP = 12
const PANEL_PADDING_X = 16
const MAX_VISIBLE_TILES = 5

function wallpaperPanelWidth(count: number, fallback: number): number {
  if (count <= 0) return fallback
  const tiles = Math.min(count, MAX_VISIBLE_TILES)
  return Math.max(fallback, tiles * TILE_WIDTH + (tiles - 1) * TILE_GAP + PANEL_PADDING_X * 2)
}

interface WallpaperOption {
  name: string
  path: string
  thumbnail: string
  url: string
}

interface WallpaperViewProps {
  query: string
  darkText: boolean
  defaultWidth: number
  onWidthChange: (width: number) => void
  registerKeys: (handler: ((event: React.KeyboardEvent) => boolean) | null) => void
}

function WallpaperCarousel({ wallpapers, selectedIndex, darkText, onPick }: { wallpapers: WallpaperOption[]; selectedIndex: number; darkText: boolean; onPick: (index: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const centeredOnce = useRef(false)
  const selectedBorder = darkText ? "border-black" : "border-white"
  const defaultBorder = darkText ? "border-black/10 hover:border-black/30" : "border-white/10 hover:border-white/30"

  useEffect(() => {
    const tile = selectedRef.current
    const container = scrollRef.current
    if (!tile || !container) return
    container.scrollTo({ left: tile.offsetLeft - container.offsetWidth / 2 + tile.offsetWidth / 2, behavior: centeredOnce.current ? "smooth" : "auto" })
    centeredOnce.current = true
  }, [selectedIndex, wallpapers])

  return (
    <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-3 px-4 py-4 w-max">
        {wallpapers.map((wallpaper, index) => (
          <button
            type="button"
            key={wallpaper.path}
            ref={index === selectedIndex ? selectedRef : undefined}
            onClick={() => onPick(index)}
            className="shrink-0 cursor-pointer"
            style={{ width: TILE_WIDTH }}
          >
            <div className={`relative w-full aspect-video rounded-lg overflow-hidden bg-neutral-900 border-2 transition-colors ${index === selectedIndex ? selectedBorder : defaultBorder}`}>
              <img src={wallpaper.thumbnail} alt="" className="w-full h-full object-cover" draggable={false} />
              <div className="absolute left-0 right-0 bottom-0 px-2 py-1 bg-linear-to-t from-black/70 to-transparent">
                <span className="text-[11px] text-white truncate block text-left">{wallpaper.name}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function WallpaperView({ query, darkText, defaultWidth, onWidthChange, registerKeys }: WallpaperViewProps) {
  const colors = launcherColors(darkText)
  const currentWallpaper = useWallpaper()
  const [wallpapers, setWallpapers] = useState<WallpaperOption[] | null>(null)
  const [preview, setPreview] = useState<{ query: string; index: number } | null>(null)
  const originalPath = useRef<string | null>(null)
  const committed = useRef(false)

  const filtered = useMemo(() => {
    const list = wallpapers ?? []
    const trimmed = query.trim()
    if (!trimmed) return list
    return list
      .map((wallpaper) => ({ wallpaper, score: scoreField(trimmed, wallpaper.name) }))
      .sort((a, b) => b.score - a.score)
      .map(({ wallpaper }) => wallpaper)
  }, [wallpapers, query])

  const currentIndex = Math.max(0, filtered.findIndex((wallpaper) => wallpaper.url === currentWallpaper))
  const navigated = preview !== null && preview.query === query
  const previewIndex = navigated ? Math.min(preview.index, Math.max(0, filtered.length - 1)) : query.trim() ? 0 : currentIndex

  useEffect(() => {
    let alive = true
    Promise.all([window.shell.windows.wallpaperMine(), window.shell.windows.wallpaperPresets()]).then(([mine, presets]) => {
      if (!alive) return
      const list = [...mine, ...presets].map(({ name, path, thumbnail, url }) => ({ name, path, thumbnail, url }))
      setWallpapers(list)
      onWidthChange(wallpaperPanelWidth(list.length, defaultWidth))
    })
    return () => {
      alive = false
      onWidthChange(defaultWidth)
    }
  }, [defaultWidth, onWidthChange])

  useEffect(() => {
    if (!wallpapers || originalPath.current) return
    const original = wallpapers.find((wallpaper) => wallpaper.url === currentWallpaper)
    if (original) originalPath.current = original.path
  }, [wallpapers, currentWallpaper])

  useEffect(() => {
    const target = filtered[previewIndex]
    if (originalPath.current && target && target.url !== currentWallpaper) window.shell.windows.setWallpaper(target.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewIndex, filtered])

  useEffect(() => () => {
    if (originalPath.current && !committed.current) window.shell.windows.setWallpaper(originalPath.current)
  }, [])

  function commit(index: number) {
    const chosen = filtered[index]
    setPreview({ query, index })
    committed.current = true
    if (chosen && chosen.url !== currentWallpaper) window.shell.windows.setWallpaper(chosen.path)
    window.launcher.hide()
  }

  useEffect(() => {
    registerKeys((event) => {
      if (filtered.length === 0) return false
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const step = event.key === "ArrowRight" ? 1 : -1
        setPreview({ query, index: (previewIndex + step + filtered.length) % filtered.length })
        return true
      }
      if (event.key === "Enter") {
        commit(previewIndex)
        return true
      }
      return false
    })
    return () => registerKeys(null)
  })

  if (!wallpapers) return <div className={`px-4 py-6 text-[13px] ${colors.dim}`}>Loading wallpapers…</div>
  if (filtered.length === 0) return <div className={`px-4 py-6 text-[13px] ${colors.dim}`}>No wallpapers</div>
  return <WallpaperCarousel wallpapers={filtered} selectedIndex={previewIndex} darkText={darkText} onPick={commit} />
}

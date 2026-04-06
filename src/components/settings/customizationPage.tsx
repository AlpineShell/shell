import { useWallpaper } from '../../hooks/useWallpaper'

export default function CustomizationPage() {
  const wallpaper = useWallpaper()

  async function pickWallpaper() {
    await window.shell.windows.pickWallpaper()
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Customization</h1>
        <p className="text-sm text-white/50 mt-1">Personalize your desktop.</p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Wallpaper</span>
        <div
          className="w-full aspect-video rounded-lg bg-neutral-900 bg-cover bg-center border border-white/5"
          style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : undefined}
        />
        <button
          onClick={pickWallpaper}
          className="w-fit h-9 px-4 bg-white text-neutral-950 rounded-md font-medium text-sm hover:bg-neutral-200 transition-colors cursor-pointer"
        >
          Choose Image…
        </button>
      </div>
    </div>
  )
}

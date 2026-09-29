import { useWallpaper } from '../../hooks/useWallpaper'

export default function DesktopApp() {
  const wallpaper = useWallpaper()

  return (
    <div
      className="w-screen h-screen bg-cover bg-center"
      style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : { backgroundColor: '#1a1a2e' }}
    />
  )
}

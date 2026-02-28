import { useWallpaper } from './hooks/useWallpaper'

function App() {
  const wallpaper = useWallpaper()

  return (
    <div
      className="w-screen h-screen bg-cover bg-center"
      style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : undefined}
    />
  )
}

export default App
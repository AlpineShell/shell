import { useWallpaper } from './hooks/useWallpaper'
import TopBar from './components/topBar'

function App() {
  const wallpaper = useWallpaper()

  return (
    <div
      className="w-screen flex flex-col h-screen bg-cover bg-center"
      style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : undefined}
    >
      <TopBar />
      <div className='h-full'></div>
    </div>
  )
}

export default App
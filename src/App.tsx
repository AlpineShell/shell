import { useWallpaper } from './hooks/useWallpaper'
import TaskBar from './components/Taskbar/taskbar'

function App() {
  const wallpaper = useWallpaper()

  return (
    <div
      className="w-screen flex flex-col h-screen bg-cover bg-center"
      style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : undefined}
    >
      <div className='h-full'></div>
      <TaskBar />
    </div>
  )
}

export default App
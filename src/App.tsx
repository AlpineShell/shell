import { useWallpaper } from './hooks/useWallpaper'
import TopBar from './components/topBar'

function getMode(): 'topbar' | 'desktop' {
  const params = new URLSearchParams(window.location.search)
  return params.get('mode') === 'topbar' ? 'topbar' : 'desktop'
}

function DesktopApp() {
  const wallpaper = useWallpaper()

  return (
    <div
      className="w-screen h-screen bg-cover bg-center"
      style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : { backgroundColor: '#1a1a2e' }}
    />
  )
}

function TopBarApp() {
  return (
    <div className="w-screen h-full bg-transparent">
      <TopBar />
    </div>
  )
}

function App() {
  const mode = getMode()

  if (mode === 'topbar') {
    return <TopBarApp />
  }

  return <DesktopApp />
}

export default App

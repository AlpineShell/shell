import { useWallpaper } from './hooks/useWallpaper'
import TopBar from './components/topBar'
import AltTabSwitcher from './components/altTabSwitcher'

function getMode(): 'topbar' | 'desktop' | 'alttab' | 'setup' {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  if (mode === 'topbar') return 'topbar'
  if (mode === 'alttab') return 'alttab'
  if (mode === 'setup') return 'setup'
  return 'desktop'
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

function AltTabApp() {
  return (
    <div className="w-screen h-screen bg-transparent">
      <AltTabSwitcher />
    </div>
  )
}

function App() {
  const mode = getMode()

  if (mode === 'topbar') return <TopBarApp />
  if (mode === 'alttab') return <AltTabApp />
  return <DesktopApp />
}

export default App

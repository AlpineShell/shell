import { useWallpaper } from './hooks/useWallpaper'
import TopBar from './components/topbar/topBar'
import ScreenshotOverlay from './components/screenshot/screenshotOverlay'
import SetupApp from './components/setup/setupApp'
import SettingsApp from './components/settings/settingsApp'

function getMode(): 'topbar' | 'desktop' | 'screenshot' | 'setup' | 'settings' {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  if (mode === 'topbar') return 'topbar'
  if (mode === 'screenshot') return 'screenshot'
  if (mode === 'setup') return 'setup'
  if (mode === 'settings') return 'settings'
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

function ScreenshotApp() {
  return (
    <div className="w-screen h-screen bg-transparent">
      <ScreenshotOverlay />
    </div>
  )
}

function App() {
  const mode = getMode()

  if (mode === 'setup') return <SetupApp />
  if (mode === 'settings') return <SettingsApp />
  if (mode === 'topbar') return <TopBarApp />
  if (mode === 'screenshot') return <ScreenshotApp />
  return <DesktopApp />
}

export default App

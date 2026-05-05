import { useWallpaper } from './hooks/useWallpaper'
import TopBar from './components/topbar/topBar'
import AltTabSwitcher from './components/alttab/altTabSwitcher'
import ScreenshotOverlay from './components/screenshot/screenshotOverlay'
import SetupApp from './components/setup/setupApp'
import SettingsApp from './components/settings/settingsApp'
import LauncherApp from './components/launcher/launcherApp'

function getMode(): 'topbar' | 'desktop' | 'alttab' | 'screenshot' | 'setup' | 'settings' | 'launcher' {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  if (mode === 'topbar') return 'topbar'
  if (mode === 'alttab') return 'alttab'
  if (mode === 'screenshot') return 'screenshot'
  if (mode === 'setup') return 'setup'
  if (mode === 'settings') return 'settings'
  if (mode === 'launcher') return 'launcher'
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
  if (mode === 'alttab') return <AltTabApp />
  if (mode === 'screenshot') return <ScreenshotApp />
  if (mode === 'launcher') return <LauncherApp />
  return <DesktopApp />
}

export default App

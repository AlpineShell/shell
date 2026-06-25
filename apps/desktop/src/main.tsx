import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { useWallpaper } from './hooks/useWallpaper'

type Mode = 'topbar' | 'desktop' | 'screenshot' | 'setup' | 'settings'

function getMode(): Mode {
  const mode = new URLSearchParams(window.location.search).get('mode')
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

async function resolveView(mode: Mode): Promise<ReactNode> {
  await import('./heroui.css')
  if (mode === 'topbar') {
    const { default: TopBar } = await import('./components/topbar/topBar')
    return (
      <div className="w-screen h-full bg-transparent">
        <TopBar />
      </div>
    )
  }
  if (mode === 'screenshot') {
    const { default: ScreenshotOverlay } = await import('./components/screenshot/screenshotOverlay')
    return (
      <div className="w-screen h-screen bg-transparent">
        <ScreenshotOverlay />
      </div>
    )
  }
  if (mode === 'setup') {
    const { default: SetupApp } = await import('./components/setup/setupApp')
    return <SetupApp />
  }
  const { default: SettingsApp } = await import('./components/settings/settingsApp')
  return <SettingsApp />
}

const mode = getMode()
const root = createRoot(document.getElementById('root')!)

if (mode === 'desktop') {
  root.render(
    <StrictMode>
      <DesktopApp />
    </StrictMode>,
  )
} else {
  resolveView(mode)
    .then((view) => {
      sessionStorage.removeItem('alpine-view-retries')
      root.render(<StrictMode>{view}</StrictMode>)
    })
    .catch((err) => {
      console.error('[renderer] failed to load view chunk:', err)
      const tries = Number(sessionStorage.getItem('alpine-view-retries') || '0')
      if (tries < 3) {
        sessionStorage.setItem('alpine-view-retries', String(tries + 1))
        setTimeout(() => window.location.reload(), 500)
      }
    })
}

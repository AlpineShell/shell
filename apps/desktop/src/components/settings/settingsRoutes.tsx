import AboutPage from './aboutPage'
import AppearancePage from './appearancePage'
import AppsDefaultsPage from './appsDefaultsPage'
import AppsHub from './appsHub'
import AppsInstalledPage from './appsInstalledPage'
import AppsRunningPage from './appsRunningPage'
import AppsStartupPage from './appsStartupPage'
import BatteryPage from './batteryPage'
import BluetoothSettingsPage from './bluetoothSettingsPage'
import CalendarPage from './calendarPage'
import DisplaysPage from './displaysPage'
import InputPage from './inputPage'
import PluginsPage from './pluginsPage'
import SearchPage from './searchPage'
import SystemRevertPage from './systemRevertPage'
import TilingPage from './tilingPage'
import TrayIconsPage from './trayIconsPage'
import TrayPage from './trayPage'
import UpdatesPage from './updatesPage'
import WallpaperPage from './wallpaperPage'
import WifiSettingsPage from './wifiSettingsPage'

export const SETTINGS_ROUTES: Record<string, SettingsRouteView> = {
  'home': (navigate) => <AboutPage onNavigate={navigate} />,
  'home/revert': () => <SystemRevertPage />,
  'appearance': () => <AppearancePage />,
  'wallpaper': () => <WallpaperPage />,
  'search': () => <SearchPage />,
  'calendar': () => <CalendarPage />,
  'input': () => <InputPage />,
  'tray': (navigate) => <TrayPage onNavigate={navigate} />,
  'tray/icons': () => <TrayIconsPage />,
  'tiling': () => <TilingPage />,
  'battery': () => <BatteryPage />,
  'displays': () => <DisplaysPage />,
  'wifi': () => <WifiSettingsPage />,
  'bluetooth': () => <BluetoothSettingsPage />,
  'apps': (navigate) => <AppsHub onNavigate={navigate} />,
  'apps/installed': () => <AppsInstalledPage />,
  'apps/startup': () => <AppsStartupPage />,
  'apps/running': () => <AppsRunningPage />,
  'apps/defaults': () => <AppsDefaultsPage />,
  'plugins': () => <PluginsPage />,
  'updates': () => <UpdatesPage />,
}

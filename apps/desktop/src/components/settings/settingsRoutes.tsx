import AboutPage from './aboutPage'
import AppsDefaultsPage from './appsDefaultsPage'
import AppsHub from './appsHub'
import AppsInstalledPage from './appsInstalledPage'
import AppsRunningPage from './appsRunningPage'
import AppsStartupPage from './appsStartupPage'
import BatteryPage from './batteryPage'
import BluetoothSettingsPage from './bluetoothSettingsPage'
import DisplaysPage from './displaysPage'
import InputPage from './inputPage'
import PluginsPage from './pluginsPage'
import RidgePage from './ridgePage'
import SearchPage from './searchPage'
import SystemRevertPage from './systemRevertPage'
import TilingPage from './tilingPage'
import TrayIconsPage from './trayIconsPage'
import UpdatesPage from './updatesPage'
import WallpaperPage from './wallpaperPage'
import WifiSettingsPage from './wifiSettingsPage'

export const SETTINGS_ROUTES: Record<string, SettingsRouteView> = {
  'home': (navigate) => <AboutPage onNavigate={navigate} />,
  'home/revert': () => <SystemRevertPage />,
  'appearance': (navigate) => <RidgePage onNavigate={navigate} />,
  'wallpaper': () => <WallpaperPage />,
  'ridge': (navigate) => <RidgePage onNavigate={navigate} />,
  'ridge/tray-icons': () => <TrayIconsPage />,
  'search': () => <SearchPage />,
  'calendar': (navigate) => <RidgePage onNavigate={navigate} initialItem="clock" />,
  'input': () => <InputPage />,
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

export const SETTINGS_ROUTE_COVERAGE: Record<string, SettingsRouteCoverage> = {
  'wallpaper': { registryRows: false, renderedByThePage: ['wallpaper'] },
  'ridge': {
    registryRows: false,
    renderedByThePage: [
      'ridge-item-system-menu',
      'ridge-item-plugins-left',
      'ridge-item-notice',
      'ridge-item-media',
      'ridge-item-microphone',
      'ridge-item-status',
      'ridge-item-plugins-right',
      'ridge-item-clock',
      'ridge-layout-reset',
      'power-confirm',
      'topbar-search-icon',
      'media-visualizer',
      'tray-enabled',
      'tray-overflow',
      'tray-all-monitors',
      'clock-time-format',
      'calendar-days',
      'calendar-show-tasks',
      'topbar-color',
      'topbar-color-automatic',
      'topbar-adapt-to-apps',
    ],
  },
  'search': { registryRows: true, renderedByThePage: [] },
  'input': {
    registryRows: true,
    renderedByThePage: [
      'keyboard-layouts',
      'keyboard-layout-remove',
      'switch-input-method',
      'language-add',
      'language-remove',
      'default-input-method',
    ],
  },
  'tiling': { registryRows: true, renderedByThePage: [] },
  'battery': { registryRows: true, renderedByThePage: ['battery-saver'] },
  'displays': { registryRows: false, renderedByThePage: ['brightness'] },
  'apps/installed': { registryRows: false, renderedByThePage: ['app-uninstall'] },
  'apps/running': { registryRows: false, renderedByThePage: ['app-force-close'] },
  'plugins': { registryRows: false, renderedByThePage: ['plugin-uninstall'] },
}

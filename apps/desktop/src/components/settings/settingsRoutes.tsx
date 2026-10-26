import { pluginIdFromSettingsRoute } from '../../plugins/pluginSettingsPages'
import AboutPage from './aboutPage'
import AppearancePage from './appearancePage'
import AppsDefaultsPage from './appsDefaultsPage'
import AppsHub from './appsHub'
import AppsInstalledPage from './appsInstalledPage'
import AppsRunningPage from './appsRunningPage'
import AppsStartupPage from './appsStartupPage'
import BatteryPage from './batteryPage'
import BluetoothSettingsPage from './bluetoothSettingsPage'
import DisplaysPage from './displaysPage'
import InputPage from './inputPage'
import DateTimePage from './dateTimePage'
import PluginSettingsPage from './pluginSettingsPage'
import PluginsPage from './pluginsPage'
import RidgePage from './ridgePage'
import SearchPage from './searchPage'
import SoundPage from './soundPage'
import ShortcutsPage from './shortcutsPage'
import SystemRevertPage from './systemRevertPage'
import TilingPage from './tilingPage'
import TrayIconsPage from './trayIconsPage'
import UpdatesPage from './updatesPage'
import WallpaperPage from './wallpaperPage'
import WifiSettingsPage from './wifiSettingsPage'

export const SETTINGS_ROUTES: Record<string, SettingsRouteView> = {
  'home': (navigate) => <AboutPage onNavigate={navigate} />,
  'revert': () => <SystemRevertPage />,
  'appearance': () => <AppearancePage />,
  'wallpaper': () => <WallpaperPage />,
  'ridge': (navigate) => <RidgePage onNavigate={navigate} />,
  'ridge/tray-icons': () => <TrayIconsPage />,
  'search': () => <SearchPage />,
  'calendar': (navigate) => <RidgePage onNavigate={navigate} initialItem="clock" />,
  'input': () => <InputPage />,
  'date-time': () => <DateTimePage />,
  'tiling': () => <TilingPage />,
  'shortcuts': () => <ShortcutsPage />,
  'battery': () => <BatteryPage />,
  'sound': () => <SoundPage />,
  'displays': () => <DisplaysPage />,
  'wifi': () => <WifiSettingsPage />,
  'bluetooth': () => <BluetoothSettingsPage />,
  'apps': (navigate) => <AppsHub onNavigate={navigate} />,
  'apps/installed': () => <AppsInstalledPage />,
  'apps/startup': () => <AppsStartupPage />,
  'apps/running': () => <AppsRunningPage />,
  'apps/defaults': () => <AppsDefaultsPage />,
  'plugins': (navigate) => <PluginsPage onNavigate={navigate} />,
  'updates': () => <UpdatesPage />,
}

export const SETTINGS_ROUTE_PAGES: Record<string, string> = {
  'calendar': 'ridge',
}

export const SETTINGS_ROUTE_COVERAGE: Record<string, SettingsRouteCoverage> = {
  'wallpaper': { registryRows: false, renderedByThePage: ['wallpaper'] },
  'appearance': { registryRows: true, renderedByThePage: [] },
  'ridge': {
    registryRows: false,
    renderedByThePage: [
      'ridge-item-system-menu',
      'ridge-item-plugins-left',
      'ridge-item-desktops',
      'ridge-item-desktop-lines',
      'ridge-item-media',
      'ridge-item-microphone',
      'ridge-item-status',
      'ridge-item-plugins-right',
      'ridge-item-clock',
      'ridge-layout-reset',
      'power-confirm',
      'power-show-hibernate',
      'topbar-search-icon',
      'media-visualizer',
      'status-sound',
      'desktops-only-with-several',
      'desktop-lines-only-with-several',
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
  'date-time': { registryRows: true, renderedByThePage: ['time-zone', 'time-zone-automatic', 'time-automatic', 'time-sync'] },
  'tiling': { registryRows: true, renderedByThePage: [] },
  'battery': { registryRows: true, renderedByThePage: ['battery-saver'] },
  'sound': { registryRows: true, renderedByThePage: ['audio-output', 'audio-input'] },
  'displays': { registryRows: false, renderedByThePage: ['brightness'] },
  'apps/installed': { registryRows: false, renderedByThePage: ['app-uninstall'] },
  'apps/running': { registryRows: false, renderedByThePage: ['app-force-close'] },
  'plugins': { registryRows: false, renderedByThePage: ['plugin-uninstall'] },
  'updates': { registryRows: false, renderedByThePage: [] },
}

export function settingsRouteView(path: string): SettingsRouteView | null {
  const staticView = SETTINGS_ROUTES[path]
  if (staticView) return staticView
  const pluginId = pluginIdFromSettingsRoute(path)
  return pluginId === null ? null : () => <PluginSettingsPage pluginId={pluginId} />
}

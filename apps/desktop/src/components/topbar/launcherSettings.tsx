import {
  Activity,
  AppWindow,
  AudioLines,
  BatteryLow,
  Bluetooth,
  Bookmark,
  History,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  Leaf,
  MonitorCog,
  Package,
  PanelTop,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Smile,
  Sun,
  Volume2,
  VolumeX,
  Wallpaper,
  Wifi,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type SettingControl =
  | { kind: "toggle"; get: () => Promise<boolean>; set: (value: boolean) => Promise<unknown> }
  | { kind: "slider"; min: number; max: number; step: number; unit?: string; get: () => Promise<number>; set: (value: number) => Promise<unknown> }
  | { kind: "brightness" }
  | { kind: "navigate"; path: string }
  | { kind: "wallpaper" }
  | { kind: "wifi" }
  | { kind: "bluetooth" }
  | { kind: "tiling" }
  | { kind: "startup" }
  | { kind: "power" }
  | { kind: "tray" }
  | { kind: "emoji" }

export interface SettingCommand {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  keywords: string[]
  control: SettingControl
}

export const SETTING_COMMANDS: SettingCommand[] = [
  {
    id: "wifi",
    label: "Wi-Fi",
    hint: "Networks and Wi-Fi on/off",
    icon: Wifi,
    keywords: ["wifi", "wi-fi", "wireless", "internet", "networks", "ssid"],
    control: { kind: "wifi" },
  },
  {
    id: "bluetooth",
    label: "Bluetooth",
    hint: "Devices, pairing and Bluetooth on/off",
    icon: Bluetooth,
    keywords: ["bluetooth", "bt", "wireless", "devices", "pair"],
    control: { kind: "bluetooth" },
  },
  {
    id: "mute",
    label: "Mute",
    hint: "Mute or unmute system audio",
    icon: VolumeX,
    keywords: ["mute", "silence", "sound", "audio"],
    control: { kind: "toggle", get: () => window.shell.system.mute(), set: (v) => window.shell.system.setMute(v) },
  },
  {
    id: "topbar-search-icon",
    label: "Top bar search icon",
    hint: "Show the search button in the top bar",
    icon: Search,
    keywords: ["search icon", "top bar", "launcher button"],
    control: { kind: "toggle", get: () => window.topbar.searchIcon(), set: (v) => window.topbar.setSearchIcon(v) },
  },
  {
    id: "recent-apps",
    label: "Recent apps",
    hint: "Show recent apps before you type",
    icon: History,
    keywords: ["recent apps", "recents", "suggestions", "frequent apps", "empty search", "show apps"],
    control: { kind: "toggle", get: () => window.launcher.recentApps(), set: (v) => window.launcher.setRecentApps(v) },
  },
  {
    id: "browser-bookmarks",
    label: "Browser bookmarks",
    hint: "Show your browser bookmarks in Search",
    icon: Bookmark,
    keywords: ["bookmarks", "browser", "favorites", "favourites", "links", "sites"],
    control: { kind: "toggle", get: () => window.launcher.showBookmarks(), set: (v) => window.launcher.setShowBookmarks(v) },
  },
  {
    id: "browser-tabs",
    label: "Browser tabs",
    hint: "Show open browser tabs in Search",
    icon: AppWindow,
    keywords: ["tabs", "open tabs", "browser tabs", "switch tab", "chrome", "firefox", "edge"],
    control: { kind: "toggle", get: () => window.launcher.showBrowserTabs(), set: (v) => window.launcher.setShowBrowserTabs(v) },
  },
  {
    id: "media-visualizer",
    label: "Media visualizer",
    hint: "Show the audio visualizer in the top bar",
    icon: AudioLines,
    keywords: ["media", "visualizer", "audio", "top bar"],
    control: { kind: "toggle", get: () => window.topbar.mediaVisualizer(), set: (v) => window.topbar.setMediaVisualizer(v) },
  },
  {
    id: "tray",
    label: "System tray",
    hint: "Show the tray, manage icons and options",
    icon: LayoutGrid,
    keywords: ["tray", "system tray", "notification area", "icons", "overflow"],
    control: { kind: "tray" },
  },
  {
    id: "tiling",
    label: "Window tiling",
    hint: "Mode, gaps, snapping and layout",
    icon: LayoutDashboard,
    keywords: ["tiling", "snap", "window management", "tile", "gap", "layout"],
    control: { kind: "tiling" },
  },
  {
    id: "volume",
    label: "Volume",
    hint: "Adjust system volume",
    icon: Volume2,
    keywords: ["volume", "sound", "audio", "loudness"],
    control: { kind: "slider", min: 0, max: 100, step: 5, unit: "%", get: () => window.shell.system.volume(), set: (v) => window.shell.system.setVolume(v) },
  },
  {
    id: "brightness",
    label: "Brightness",
    hint: "Adjust screen brightness",
    icon: Sun,
    keywords: ["brightness", "screen", "display", "backlight", "monitor", "displays"],
    control: { kind: "brightness" },
  },
  {
    id: "battery-saver",
    label: "Force battery saver on",
    hint: "Hold battery saver on until you next plug in",
    icon: Leaf,
    keywords: ["battery saver", "battery", "power saving", "energy saver", "low power", "eco"],
    control: {
      kind: "toggle",
      get: () => window.shell.batterySaver.state().then((s) => s.override === "on"),
      set: (v) => window.shell.batterySaver.setOverride(v ? "on" : "auto"),
    },
  },
  {
    id: "battery-saver-automatic",
    label: "Automatic battery saver",
    hint: "Enter battery saver on its own when the charge runs low",
    icon: BatteryLow,
    keywords: ["automatic battery saver", "battery", "power saving", "auto", "low battery"],
    control: {
      kind: "toggle",
      get: () => window.shell.batterySaver.config().then((c) => c.automaticEnabled),
      set: (v) => window.shell.batterySaver.setConfig({ automaticEnabled: v }),
    },
  },
  {
    id: "battery-saver-threshold",
    label: "Battery saver threshold",
    hint: "Charge level that turns battery saver on",
    icon: BatteryLow,
    keywords: ["battery saver threshold", "battery percent", "power saving level", "low battery", "percentage"],
    control: {
      kind: "slider",
      min: 5,
      max: 90,
      step: 5,
      unit: "%",
      get: () => window.shell.batterySaver.config().then((c) => c.thresholdPercent),
      set: (v) => window.shell.batterySaver.setConfig({ thresholdPercent: v }),
    },
  },
  {
    id: "battery-saver-dimming",
    label: "Battery saver dimming",
    hint: "Dim the displays while battery saver is on",
    icon: Sun,
    keywords: ["battery saver dimming", "dim", "brightness", "power saving", "screen"],
    control: {
      kind: "toggle",
      get: () => window.shell.batterySaver.config().then((c) => c.dimDisplays),
      set: (v) => window.shell.batterySaver.setConfig({ dimDisplays: v }),
    },
  },
  {
    id: "battery-saver-dim-amount",
    label: "Battery saver dim amount",
    hint: "How much to dim while battery saver is on",
    icon: Sun,
    keywords: ["battery saver dim amount", "dim by", "brightness", "power saving", "screen"],
    control: {
      kind: "slider",
      min: 5,
      max: 60,
      step: 5,
      unit: "%",
      get: () => window.shell.batterySaver.config().then((c) => c.brightnessReductionPercent),
      set: (v) => window.shell.batterySaver.setConfig({ brightnessReductionPercent: v }),
    },
  },
  {
    id: "battery-saver-polling",
    label: "Battery saver background checks",
    hint: "Slow background checks while battery saver is on",
    icon: Activity,
    keywords: ["battery saver background", "polling", "bluetooth", "wifi", "power saving", "checks"],
    control: {
      kind: "toggle",
      get: () => window.shell.batterySaver.config().then((c) => c.reduceBackgroundPolling),
      set: (v) => window.shell.batterySaver.setConfig({ reduceBackgroundPolling: v }),
    },
  },
  {
    id: "battery-saver-throttling",
    label: "Battery saver process throttling",
    hint: "Run Alpine at efficiency speed while battery saver is on",
    icon: Activity,
    keywords: ["battery saver throttling", "ecoqos", "efficiency", "power saving", "cpu"],
    control: {
      kind: "toggle",
      get: () => window.shell.batterySaver.config().then((c) => c.throttleProcesses),
      set: (v) => window.shell.batterySaver.setConfig({ throttleProcesses: v }),
    },
  },
  {
    id: "wallpaper",
    label: "Wallpaper",
    hint: "Change your desktop wallpaper",
    icon: Wallpaper,
    keywords: ["wallpaper", "background", "desktop", "image", "theme"],
    control: { kind: "wallpaper" },
  },
  {
    id: "emoji",
    label: "Emoji",
    hint: "Search and insert an emoji",
    icon: Smile,
    keywords: ["emoji", "emojis", "emoticon", "smiley", "smileys", "symbols", "face", "reaction", "emote", "sticker"],
    control: { kind: "emoji" },
  },
  {
    id: "topbar",
    label: "Top bar",
    hint: "Color and appearance",
    icon: PanelTop,
    keywords: ["top bar", "topbar", "color", "appearance"],
    control: { kind: "navigate", path: "personalization/topbar" },
  },
  {
    id: "hotkeys",
    label: "Hotkeys",
    hint: "Function keys",
    icon: Keyboard,
    keywords: ["hotkeys", "shortcuts", "keyboard"],
    control: { kind: "navigate", path: "personalization/hotkeys" },
  },
  {
    id: "updates",
    label: "Updates",
    hint: "Check for updates",
    icon: RefreshCw,
    keywords: ["updates", "upgrade", "version"],
    control: { kind: "navigate", path: "updates" },
  },
  {
    id: "apps-running",
    label: "Running apps",
    hint: "See what is open right now",
    icon: Activity,
    keywords: ["running apps", "tasks", "processes"],
    control: { kind: "navigate", path: "apps/running" },
  },
  {
    id: "apps-installed",
    label: "Installed apps",
    hint: "Open or uninstall apps",
    icon: Package,
    keywords: ["installed apps", "uninstall", "programs"],
    control: { kind: "navigate", path: "apps/installed" },
  },
  {
    id: "startup",
    label: "Startup apps",
    hint: "Choose what opens on boot",
    icon: Power,
    keywords: ["startup apps", "autostart", "boot"],
    control: { kind: "startup" },
  },
  {
    id: "revert",
    label: "Revert to Windows",
    hint: "Switch back to Windows Explorer",
    icon: RotateCcw,
    keywords: ["revert", "uninstall shell", "delete", "remove", "explorer", "windows"],
    control: { kind: "navigate", path: "system/revert" },
  },
  {
    id: "system",
    label: "System",
    hint: "About this PC",
    icon: MonitorCog,
    keywords: ["system", "about", "pc info", "specs"],
    control: { kind: "navigate", path: "home" },
  },
  {
    id: "power",
    label: "Power",
    hint: "Shut down, restart or log out",
    icon: Power,
    keywords: ["power", "shut down", "shutdown", "restart", "reboot", "log out", "logout", "sign out"],
    control: { kind: "power" },
  },
]

import {
  Activity,
  AudioLines,
  Bluetooth,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  MonitorCog,
  Package,
  PanelTop,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
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
  | { kind: "navigate"; path: string }
  | { kind: "wallpaper" }
  | { kind: "wifi" }
  | { kind: "bluetooth" }
  | { kind: "tiling" }
  | { kind: "startup" }
  | { kind: "power" }
  | { kind: "tray" }

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
    keywords: ["brightness", "screen", "display", "backlight"],
    control: { kind: "slider", min: 0, max: 100, step: 5, unit: "%", get: () => window.shell.system.brightness(), set: (v) => window.shell.system.setBrightness(v) },
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
    keywords: ["revert", "uninstall shell", "explorer", "windows"],
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

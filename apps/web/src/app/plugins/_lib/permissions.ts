export type PermissionRisk = "auto" | "read" | "control" | "sensitive" | "node";

export interface PermissionMeta {
  label: string;
  description: string;
  risk: PermissionRisk;
}

export const PERMISSION_META: Record<string, PermissionMeta> = {
  storage: {
    label: "Store its own settings",
    description: "Save data private to this plugin.",
    risk: "auto",
  },
  clock: {
    label: "Read the clock",
    description: "Read the current time and timezone.",
    risk: "auto",
  },
  theme: {
    label: "Match the shell theme",
    description: "Read the topbar light/dark theme and colors.",
    risk: "auto",
  },
  "read:volume": {
    label: "Read the system volume",
    description: "Read the current volume level and mute state.",
    risk: "read",
  },
  "read:brightness": {
    label: "Read screen brightness",
    description: "Read the current brightness level.",
    risk: "read",
  },
  "read:media": {
    label: "Read now-playing",
    description: "Read the current track title, artist and playback state.",
    risk: "read",
  },
  "read:network": {
    label: "Read network status",
    description: "Read the Wi-Fi connection and signal strength.",
    risk: "read",
  },
  "read:bluetooth": {
    label: "Read Bluetooth status",
    description: "Read the radio state and paired devices.",
    risk: "read",
  },
  "read:battery": {
    label: "Read battery status",
    description: "Read the charge level and charging state.",
    risk: "read",
  },
  "read:apps": {
    label: "Read installed apps",
    description: "Read the list of installed and running apps.",
    risk: "read",
  },
  "read:windows": {
    label: "Read open windows",
    description: "Read the titles of open windows.",
    risk: "read",
  },
  "read:system-info": {
    label: "Read system info",
    description: "Read an OS and hardware summary.",
    risk: "read",
  },
  "net:fetch": {
    label: "Make network requests",
    description: "Fetch data from its allow-listed hosts only.",
    risk: "read",
  },
  "location:coarse": {
    label: "Know your approximate location",
    description: "Read your city-level location.",
    risk: "read",
  },
  notifications: {
    label: "Show notifications",
    description: "Post desktop notifications.",
    risk: "read",
  },
  "control:volume": {
    label: "Change the volume",
    description: "Set the system volume and mute.",
    risk: "control",
  },
  "control:brightness": {
    label: "Change brightness",
    description: "Set the screen brightness.",
    risk: "control",
  },
  "control:media": {
    label: "Control playback",
    description: "Play, pause and skip media.",
    risk: "control",
  },
  "control:wallpaper": {
    label: "Change your wallpaper",
    description: "Set the desktop wallpaper.",
    risk: "control",
  },
  "control:windows": {
    label: "Manage windows",
    description: "Move, resize and focus windows.",
    risk: "control",
  },
  "control:power": {
    label: "Shut down / restart the PC",
    description: "Shut down, restart or sleep the machine.",
    risk: "sensitive",
  },
  "control:network": {
    label: "Connect to Wi-Fi networks",
    description: "Join a Wi-Fi network.",
    risk: "sensitive",
  },
  "control:bluetooth": {
    label: "Change Bluetooth",
    description: "Pair with and toggle devices.",
    risk: "sensitive",
  },
  "launch:apps": {
    label: "Launch applications",
    description: "Open an installed app.",
    risk: "sensitive",
  },
  node: {
    label: "Run a background process",
    description: "Run its own Node backend (verified publishers only).",
    risk: "node",
  },
};

export const RISK_LABEL: Record<PermissionRisk, string> = {
  auto: "Automatic",
  read: "Reads data",
  control: "Changes settings",
  sensitive: "Sensitive",
  node: "Backend",
};

export const CATEGORIES = [
  "Topbar",
  "Desktop",
  "Launcher",
  "Settings",
  "Utilities",
  "Fun",
] as const;

export const installDeepLink = (id: string, version: string) =>
  `alpine-shell://install-plugin?id=${encodeURIComponent(id)}&version=${encodeURIComponent(version)}`;

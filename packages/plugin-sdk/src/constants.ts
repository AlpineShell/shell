export const PLUGIN_API_VERSION = 1 as const

export const SUPPORTED_API_VERSIONS: readonly number[] = [1]

export const PLUGIN_ID_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export const PLUGIN_PERMISSIONS = [
  'storage', 'clock', 'theme',
  'read:volume', 'read:brightness', 'read:media', 'read:network', 'read:bluetooth',
  'read:battery', 'read:apps', 'read:windows', 'read:system-info',
  'net:fetch', 'location:coarse', 'notifications',
  'control:volume', 'control:brightness', 'control:media', 'control:wallpaper', 'control:windows',
  'control:power', 'control:network', 'control:bluetooth', 'launch:apps',
  'node',
] as const

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number]

export type PermissionTier = 'auto' | 'read' | 'control' | 'sensitive' | 'node'

export interface PermissionMeta {
  tier: PermissionTier
  label: string
  description: string
  confirm?: boolean
  gated?: true
}

export const PERMISSION_META: Record<PluginPermission, PermissionMeta> = {
  storage: { tier: 'auto', label: 'Store its own settings', description: 'Save data private to this plugin.' },
  clock: { tier: 'auto', label: 'Read the clock', description: 'Current time and timezone.' },
  theme: { tier: 'auto', label: 'Match the shell theme', description: 'Read light/dark and topbar colors.' },
  'read:volume': { tier: 'read', label: 'Read the volume', description: 'Current system volume and mute.' },
  'read:brightness': { tier: 'read', label: 'Read screen brightness', description: 'Current brightness level.' },
  'read:media': { tier: 'read', label: 'Read now-playing', description: 'Track title/artist/state.' },
  'read:network': { tier: 'read', label: 'Read network status', description: 'Wi-Fi connection and signal.' },
  'read:bluetooth': { tier: 'read', label: 'Read Bluetooth status', description: 'Radio state and paired devices.' },
  'read:battery': { tier: 'read', label: 'Read battery status', description: 'Charge level and charging state.' },
  'read:apps': { tier: 'read', label: 'Read installed apps', description: 'List of installed/running apps.' },
  'read:windows': { tier: 'read', label: 'Read open windows', description: 'Titles of open windows.' },
  'read:system-info': { tier: 'read', label: 'Read system info', description: 'OS/hardware summary.' },
  'net:fetch': { tier: 'read', label: 'Access the network', description: 'Fetch from its declared hosts only.' },
  'location:coarse': { tier: 'read', label: 'Approximate location', description: 'City-level location.' },
  notifications: { tier: 'read', label: 'Show notifications', description: 'Post desktop notifications.' },
  'control:volume': { tier: 'control', label: 'Change the volume', description: 'Set volume and mute.' },
  'control:brightness': { tier: 'control', label: 'Change brightness', description: 'Set screen brightness.' },
  'control:media': { tier: 'control', label: 'Control playback', description: 'Play/pause/skip media.' },
  'control:wallpaper': { tier: 'control', label: 'Change the wallpaper', description: 'Set the desktop wallpaper.' },
  'control:windows': { tier: 'control', label: 'Manage windows', description: 'Move/resize/focus windows.' },
  'control:power': { tier: 'sensitive', label: 'Power actions', description: 'Shut down, restart, sleep.', confirm: true },
  'control:network': { tier: 'sensitive', label: 'Change Wi-Fi', description: 'Join a Wi-Fi network.', confirm: true, gated: true },
  'control:bluetooth': { tier: 'sensitive', label: 'Change Bluetooth', description: 'Pair/toggle devices.', confirm: true },
  'launch:apps': { tier: 'sensitive', label: 'Launch apps', description: 'Open an installed app.', confirm: true },
  node: { tier: 'node', label: 'Run a background service', description: 'Run its own Node backend.', gated: true },
}

export const MARKETPLACE_CATEGORIES = [
  'productivity', 'system', 'media', 'developer', 'social', 'fun', 'other',
] as const

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]

export function isSupportedApiVersion(v: number): boolean {
  return SUPPORTED_API_VERSIONS.includes(v)
}

function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function satisfiesRange(version: string, range: string): boolean {
  const v = parseVersion(version)
  if (!v) return false
  const r = (range || '').trim()
  if (r === '' || r === '*') return true
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  if (r.startsWith('^')) {
    const b = parseVersion(r.slice(1))
    if (!b) return false
    return cmp(v, b) >= 0 && (b[0] > 0 ? v[0] === b[0] : b[1] > 0 ? v[0] === 0 && v[1] === b[1] : v[0] === 0 && v[1] === 0 && v[2] === b[2])
  }
  if (r.startsWith('~')) {
    const b = parseVersion(r.slice(1))
    if (!b) return false
    return cmp(v, b) >= 0 && v[0] === b[0] && v[1] === b[1]
  }
  if (r.startsWith('>=')) { const b = parseVersion(r.slice(2)); return b ? cmp(v, b) >= 0 : false }
  if (r.startsWith('<=')) { const b = parseVersion(r.slice(2)); return b ? cmp(v, b) <= 0 : false }
  if (r.startsWith('>')) { const b = parseVersion(r.slice(1)); return b ? cmp(v, b) > 0 : false }
  if (r.startsWith('<')) { const b = parseVersion(r.slice(1)); return b ? cmp(v, b) < 0 : false }
  const b = parseVersion(r)
  return b ? cmp(v, b) === 0 : false
}

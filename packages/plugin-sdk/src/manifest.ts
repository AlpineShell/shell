import type { PluginPermission } from './constants'
import type { PluginContributions } from './contributions'

export interface PluginAuthor {
  name: string
  url?: string
  email?: string
}

export type PermissionRationale = Partial<Record<PluginPermission, string>>

export interface PluginScreenshot {
  src: string
  caption?: string
  dark?: boolean
}

export interface PluginMarketplaceMeta {
  displayName?: string
  logo?: string
  shortDescription?: string
  readme?: string
  screenshots?: PluginScreenshot[]
  category?: string
  keywords?: string[]
  permissionRationale?: PermissionRationale
}

export interface PluginManifest {
  $schema?: string
  id: string
  name: string
  version: string
  apiVersion: number
  engines?: { alpineShell?: string }
  description?: string
  author?: PluginAuthor
  homepage?: string
  repository?: string
  license?: string
  icon?: string
  renderer?: string
  main?: string
  contributes?: PluginContributions
  permissions?: PluginPermission[]
  optionalPermissions?: PluginPermission[]
  network?: { connect?: string[] }
  marketplace?: PluginMarketplaceMeta
}

import type { PluginContributions } from './contributions'

export interface PluginAuthor {
  name: string
  url?: string
  email?: string
}

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
}

export interface PluginManifest {
  $schema?: string
  id?: string
  name: string
  version: string
  apiVersion?: number
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
  marketplace?: PluginMarketplaceMeta
}

type PluginManifestFieldTable = { [Field in keyof Required<PluginManifest>]: true }

const PLUGIN_MANIFEST_FIELD_TABLE: PluginManifestFieldTable = {
  $schema: true,
  id: true,
  name: true,
  version: true,
  apiVersion: true,
  engines: true,
  description: true,
  author: true,
  homepage: true,
  repository: true,
  license: true,
  icon: true,
  renderer: true,
  main: true,
  contributes: true,
  marketplace: true,
}

export const PLUGIN_MANIFEST_FIELDS = Object.keys(PLUGIN_MANIFEST_FIELD_TABLE) as readonly (keyof PluginManifest)[]

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PLUGIN_MANIFEST_FIELDS } from '@alpine/plugin-sdk'
import { createPluginContext } from './pluginBackendContext.js'
import { createPluginSettings } from './pluginBackendSettings.js'
import { parseManifest } from './pluginManifest.js'

const PLUGIN_ID = 'com.example.surface'

const CONTRACT_BROKEN = 'API version 1 plugins rely on this. Read "Plugin API is a public contract" in CLAUDE.md before removing or renaming it.'

const API_1_BACKEND_CONTEXT = [
  'id',
  'pluginDir',
  'dataDir',
  'publish',
  'log',
  'onStop',
  'onCommand',
  'poll',
  'settings.get',
  'settings.onChange',
  'shell.openCommand',
  'windows.open',
  'windows.close',
  'windows.send',
  'windows.onEvent',
]

const API_1_MANIFEST_FILE_FIELDS = [
  '$schema',
  'id',
  'name',
  'version',
  'apiVersion',
  'engines',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'icon',
  'renderer',
  'main',
  'contributes',
  'marketplace',
]

const API_1_MANIFEST_FIELDS = [
  'id',
  'name',
  'version',
  'apiVersion',
  'engines.alpineShell',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'icon',
  'renderer',
  'main',
  'contributes.settings.key',
  'contributes.settings.type',
  'contributes.settings.label',
  'contributes.settings.info',
  'contributes.settings.default',
  'contributes.topbarWidgets.slot',
  'contributes.topbarWidgets.export',
  'contributes.settingsPages.label',
  'contributes.settingsPages.icon',
  'contributes.settingsPages.topLevel',
  'contributes.settingsPages.path',
  'contributes.settingsPages.export',
  'contributes.launcherCommands.kind',
  'contributes.launcherCommands.export',
  'contributes.backendModules.export',
  'contributes.fileHandlers.extensions',
  'contributes.fileHandlers.command',
  'contributes.fileHandlers.name',
  'contributes.fileHandlers.export',
  'contributes.launcherFolders.startMenuFolder',
  'contributes.launcherFolders.badge',
  'contributes.launcherFolders.uninstallCommand',
  'contributes.launcherFolders.openCommand',
  'contributes.launcherFolders.export',
  'contributes.windowRules.process',
  'contributes.windowRules.className',
  'contributes.windowRules.titleSuffix',
  'contributes.windowRules.startMenuFolder',
  'contributes.windowRules.border',
  'contributes.windowRules.contentInset',
  'marketplace.displayName',
  'marketplace.shortDescription',
  'marketplace.logo',
  'marketplace.readme',
  'marketplace.screenshots',
  'marketplace.category',
  'marketplace.keywords',
]

const API_1_MANIFEST = {
  $schema: 'https://alpineshell.com/schema/plugin-v1.json',
  id: PLUGIN_ID,
  name: 'Surface',
  version: '1.2.3',
  apiVersion: 1,
  engines: { alpineShell: '>=0.1.0' },
  description: 'Every field an API 1 plugin can use',
  author: { name: 'Example Labs', url: 'https://example.com' },
  homepage: 'https://example.com/surface',
  repository: 'https://github.com/example/surface',
  license: 'MIT',
  icon: 'icon.png',
  renderer: 'index.js',
  main: 'backend.js',
  contributes: {
    settings: [{ key: 'show-wind', type: 'toggle', label: 'Show wind', info: 'Shows the wind speed', default: false }],
    topbarWidgets: [{ slot: 'right', export: 'Widget' }],
    settingsPages: [{ label: 'Surface', icon: 'lucide:Cog', topLevel: true, path: 'surface', export: 'SettingsPage' }],
    launcherCommands: [{ kind: 'action', export: 'Command' }],
    backendModules: [{ export: 'Backend' }],
    fileHandlers: [{ extensions: ['.surface'], command: 'open-file', name: 'Surface file', export: 'Files' }],
    launcherFolders: [{ startMenuFolder: 'Surface apps', badge: 'badge.png', uninstallCommand: 'uninstall', openCommand: 'open', export: 'Folder' }],
    windowRules: [{ process: 'surface.exe', className: 'SurfaceWindow', titleSuffix: ' - Surface', startMenuFolder: 'Surface apps', border: 'none', contentInset: 4 }],
  },
  marketplace: {
    displayName: 'Surface',
    shortDescription: 'Every field',
    logo: 'logo.png',
    readme: 'README.md',
    screenshots: [{ src: 'shot.png', caption: 'The widget', dark: false }],
    category: 'developer',
    keywords: ['surface'],
  },
}

const PLUGIN_FILES = ['index.js', 'backend.js', 'icon.png', 'logo.png', 'README.md', 'shot.png', 'badge.png']

function valueAt(source, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => {
    const item = Array.isArray(value) ? value[0] : value
    return item == null ? undefined : item[key]
  }, source)
}

function contractFailure(what, missing) {
  return `${what} no longer provides ${missing.join(', ')}. ${CONTRACT_BROKEN}`
}

function backendContext() {
  const init = { id: PLUGIN_ID, dir: path.resolve(path.join(path.sep, 'plugins', PLUGIN_ID)), dataDir: path.resolve(path.join(path.sep, 'plugin-data', PLUGIN_ID)) }
  const ignore = () => {}
  return createPluginContext(init, {
    post: ignore,
    settings: createPluginSettings({}, ignore).api,
    setStopHandler: ignore,
    setCommandHandler: ignore,
    setWindowEventHandler: ignore,
  })
}

let pluginsDir

function parsedApi1Manifest() {
  const pluginDir = path.join(pluginsDir, PLUGIN_ID)
  fs.mkdirSync(pluginDir)
  for (const file of PLUGIN_FILES) fs.writeFileSync(path.join(pluginDir, file), '')
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(API_1_MANIFEST))
  return parseManifest(pluginDir, PLUGIN_ID, { appVersion: '1.0.0' }).record
}

beforeEach(() => {
  pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-api-surface-'))
})

afterEach(() => {
  fs.rmSync(pluginsDir, { recursive: true, force: true })
})

describe('the plugin API version 1 surface', () => {
  it('still gives a backend every member of ctx', () => {
    const ctx = backendContext()
    const missing = API_1_BACKEND_CONTEXT.filter((member) => valueAt(ctx, member) === undefined)
    expect(missing, contractFailure('The backend ctx', missing)).toEqual([])
  })

  it('still accepts every top-level plugin.json field in the SDK', () => {
    const missing = API_1_MANIFEST_FILE_FIELDS.filter((field) => !PLUGIN_MANIFEST_FIELDS.includes(field))
    expect(missing, contractFailure('The SDK manifest field list', missing)).toEqual([])
  })

  it('still reads every plugin.json field', () => {
    const record = parsedApi1Manifest()
    expect(record.errors).toEqual([])
    expect(record.compat).toEqual({ apiOk: true, engineOk: true, reason: null })
    const missing = API_1_MANIFEST_FIELDS.filter((field) => {
      const declared = valueAt(API_1_MANIFEST, field)
      return declared === undefined || JSON.stringify(valueAt(record, field)) !== JSON.stringify(declared)
    })
    expect(missing, contractFailure('pluginManifest.js', missing)).toEqual([])
  })
})

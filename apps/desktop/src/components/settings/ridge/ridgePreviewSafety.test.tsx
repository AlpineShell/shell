import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { TOPBAR_ITEMS } from '../../topbar/layout/topbarLayout'
import { useRidgePreviewData } from '../../../hooks/useRidgePreviewData'
import { clearWidgets, registerContribution } from '../../../plugins/pluginRegistry'
import { RIDGE_ITEM_PREVIEWS } from './ridgeItemPreviewMap'
import { ridgePluginRecord, ridgeTrayIcon } from './ridgeTestFixtures'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const TRAY_ICONS = [ridgeTrayIcon('dropbox'), ridgeTrayIcon('onedrive'), ridgeTrayIcon('steam')]

const CHANNEL_VALUES: Record<string, unknown> = {
  'topbar.color': { r: 12, g: 40, b: 64, darkText: false },
  'topbar.mediaVisualizer': false,
  'shell.clock.prefs': { timeFormat: '24h', systemTimeFormat: '24h', calendarDays: 1, showTasks: true },
  'shell.system.battery': { percent: 64, charging: false, onAcPower: false, hasBattery: true },
  'shell.system.bluetooth': { radio: { state: 'on', pending: null, error: null }, devices: [], devicesAvailable: true },
  'shell.network.wifiSignal': { signal: 80, connected: true, type: 'wifi', ssid: 'Home', wifi: { connected: true, ssid: 'Home', signal: 80 } },
  'shell.media.session': {
    title: 'Blue in Green',
    artist: 'Miles Davis',
    appName: 'Spotify',
    appIcon: 'iVBORw0KGgo=',
    playing: true,
    thumbnail: null,
    thumbnailType: null,
  },
  'shell.media.microphone': { active: true, apps: ['Zoom', 'Teams'] },
  'shell.desktops.state': { count: 3, current: 1 },
  'shell.tray.icons': TRAY_ICONS,
  'shell.tray.layout': { order: ['onedrive', 'dropbox'], hidden: ['steam'] },
  'shell.tray.settings': { enabled: true, showOverflow: true },
  'plugins.list': [
    ridgePluginRecord({ contributes: { topbarWidgets: [{ slot: 'left', export: 'Forecast' }] } }),
    ridgePluginRecord({ id: 'com.example.notes', name: 'Notes', contributes: { topbarWidgets: [{ slot: 'right' }] } }),
  ],
}

const CHANNEL_SUBSCRIPTIONS = [
  'screenshot.onSaved',
  'topbar.onColorChanged',
  'topbar.onMediaVisualizerChanged',
  'shell.clock.onPrefsChanged',
  'shell.system.onResume',
  'shell.system.onBatteryChanged',
  'shell.system.onBluetoothChanged',
  'shell.network.onWifiSignalChanged',
  'shell.media.onSessionChanged',
  'shell.media.onMicrophoneChanged',
  'shell.desktops.onChanged',
  'shell.tray.onIconsChanged',
  'shell.tray.onLayoutChanged',
  'shell.tray.onSettingsChanged',
  'plugins.onReload',
]

const READ_BRIDGES = [...Object.keys(CHANNEL_VALUES), ...CHANNEL_SUBSCRIPTIONS]

const FORBIDDEN_BRIDGES = [
  'launcher.show',
  'shell.system.powerAction',
  'shell.tray.click',
  'shell.tray.setLayout',
  'shell.system.subscribePeak',
  'shell.network.wifiScan',
  'shell.network.wifiState',
  'shell.system.bluetoothRefresh',
  'shell.system.bluetoothConnect',
  'shell.system.bluetoothDisconnect',
  'shell.media.control',
  'shell.system.setVolume',
  'shell.system.setMonitorBrightness',
  'topbar.setActiveRegion',
  'topbar.setInteractiveZones',
  'shell.desktops.switchTo',
  'shell.desktops.add',
  'shell.desktops.close',
]

const OTHER_BRIDGES = [
  'launcher.hide',
  'notice.current',
  'notice.onShow',
  'notice.onHide',
  'plugins.reload',
  'plugins.setEnabled',
  'topbar.setLayout',
  'topbar.setSearchIcon',
  'topbar.setMediaVisualizer',
  'shell.clock.setPrefs',
  'shell.network.wifiRadioSet',
  'shell.network.onWifiChanged',
  'shell.system.unsubscribePeak',
  'shell.system.onAudioPeak',
  'shell.system.bluetoothSetRadio',
  'shell.system.bluetoothRemove',
  'shell.system.bluetoothRepairAudio',
  'shell.system.bluetoothOpenSettings',
  'shell.tray.display',
  'shell.tray.onDisplayChanged',
  'shell.tray.setDisplay',
  'shell.tray.setSettings',
]

const BRIDGE_ROOTS = ['shell', 'topbar', 'launcher', 'plugins', 'notice', 'screenshot']

function installBridge(path: string, bridge: Mock) {
  const keys = path.split('.')
  const owner = keys.slice(0, -1).reduce((node, key) => {
    node[key] ??= {}
    return node[key] as Record<string, unknown>
  }, window as unknown as Record<string, unknown>)
  owner[keys[keys.length - 1]] = bridge
}

function stubBridges(): Map<string, Mock> {
  const bridges = new Map<string, Mock>()
  for (const [path, value] of Object.entries(CHANNEL_VALUES)) bridges.set(path, vi.fn().mockResolvedValue(value))
  for (const path of CHANNEL_SUBSCRIPTIONS) bridges.set(path, vi.fn().mockImplementation(() => vi.fn()))
  for (const path of [...FORBIDDEN_BRIDGES, ...OTHER_BRIDGES]) bridges.set(path, vi.fn())
  bridges.forEach((bridge, path) => installBridge(path, bridge))
  return bridges
}

function bridgesCalledBesidesReads(bridges: Map<string, Mock>): string[] {
  return [...bridges]
    .filter(([path, bridge]) => !READ_BRIDGES.includes(path) && bridge.mock.calls.length > 0)
    .map(([path]) => path)
}

function PreviewHarness({ darkText, generation }: { darkText: boolean; generation: number }) {
  const data = useRidgePreviewData()
  return (
    <div key={generation}>
      {TOPBAR_ITEMS.map((item) => (
        <div key={item.id} data-item={item.id}>
          {createElement(RIDGE_ITEM_PREVIEWS[item.id], { data, darkText })}
        </div>
      ))}
    </div>
  )
}

function previewOf(id: TopbarItemId): Element {
  const preview = document.querySelector(`[data-item="${id}"]`)
  if (!preview) throw new Error(`no preview rendered for ${id}`)
  return preview
}

async function renderHarness() {
  const view = render(<PreviewHarness darkText={false} generation={0} />)
  await act(async () => {})
  await waitFor(() => expect(previewOf('media').textContent).toBe('Blue in Green'))
  return view
}

function sampleItems(): TopbarItemId[] {
  return TOPBAR_ITEMS.map((item) => item.id).filter((id) => previewOf(id).querySelector('[data-sample]') !== null)
}

function functionPaths(value: unknown, path: string): string[] {
  if (typeof value === 'function') return [path]
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, child]) => functionPaths(child, `${path}.${key}`))
}

function registerWidget(slot: TopbarSlot, text: string) {
  registerContribution({
    type: 'topbar-widget',
    id: `com.example.${text.toLowerCase()}:default`,
    component: () => createElement('span', null, text),
    slot,
  })
}

afterEach(() => {
  vi.useRealTimers()
  clearWidgets()
  for (const root of BRIDGE_ROOTS) delete (window as unknown as Record<string, unknown>)[root]
})

describe('the Ridge previews', () => {
  it('read their data without calling any bridge that acts on the system', async () => {
    const bridges = stubBridges()
    await renderHarness()
    expect(bridgesCalledBesidesReads(bridges)).toEqual([])
    for (const path of FORBIDDEN_BRIDGES) expect(bridges.get(path)).not.toHaveBeenCalled()
  })

  it('read media and microphone once, however often the previews remount', async () => {
    const bridges = stubBridges()
    const view = await renderHarness()
    view.rerender(<PreviewHarness darkText generation={1} />)
    view.rerender(<PreviewHarness darkText={false} generation={2} />)
    await act(async () => {})
    expect(bridges.get('shell.media.session')).toHaveBeenCalledTimes(1)
    expect(bridges.get('shell.media.microphone')).toHaveBeenCalledTimes(1)
    expect(bridgesCalledBesidesReads(bridges)).toEqual([])
  })

  it('draw every item from the channels they read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 12, 21, 41))
    stubBridges()
    await renderHarness()
    expect(previewOf('clock').textContent).toBe('21:41 Sep 12')
    expect(previewOf('microphone').textContent).toBe('Zoom, Teams')
    expect(previewOf('desktops').textContent).toBe('123')
    expect(Array.from(previewOf('tray').querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual([
      TRAY_ICONS[1].icon,
      TRAY_ICONS[0].icon,
    ])
    expect(sampleItems()).toEqual([])
  })

  it('draw the plugin widgets the bar has registered, each on its own side', async () => {
    stubBridges()
    registerWidget('left', 'Weather')
    registerWidget('right', 'Notes')
    await renderHarness()
    expect(previewOf('plugins-left').textContent).toBe('Weather')
    expect(previewOf('plugins-right').textContent).toBe('Notes')
  })

  it('get plain values from the preview data, never a function they could call', async () => {
    stubBridges()
    const { result } = renderHook(() => useRidgePreviewData())
    await act(async () => {})
    expect(result.current.media.playback.title).toBe('Blue in Green')
    expect(functionPaths(result.current, 'previewData')).toEqual([])
  })

  it('cover every item Ridge can hold', () => {
    expect(Object.keys(RIDGE_ITEM_PREVIEWS)).toEqual(expect.arrayContaining(TOPBAR_ITEMS.map((item) => item.id)))
  })
})

const TOPBAR_DIRECTORY = 'components/topbar/'
const ALLOWED_TOPBAR_MODULES = ['faces/', 'topbarSurface', 'layout/topbarLayout', 'layout/topbarLayoutEdits', 'tray/composeTray', 'calendar/calendarLayout']
const REFUSED_MODULES = ['hooks/useAudioPeak', 'hooks/useTrayDisplay', 'hooks/useShellNotice']
const IMPORT_SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm
const SOURCE_EXTENSION = /\.(tsx?|jsx?)$/
const TEST_FILE = /\.test\.(tsx?|jsx?)$/

function isAllowedTopbarModule(inside: string): boolean {
  return ALLOWED_TOPBAR_MODULES.some((allowed) => (allowed.endsWith('/') ? inside.startsWith(allowed) : inside === allowed))
}

function isRefusedModule(fromSrc: string): boolean {
  if (REFUSED_MODULES.includes(fromSrc)) return true
  return fromSrc.startsWith(TOPBAR_DIRECTORY) && !isAllowedTopbarModule(fromSrc.slice(TOPBAR_DIRECTORY.length))
}

function toSrcPath(file: string): string {
  return relative(SRC, file).split(sep).join('/').replace(SOURCE_EXTENSION, '')
}

function relativeSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((specifier) => specifier.startsWith('.'))
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function ridgeSourceFiles(): string[] {
  const hooks = join(SRC, 'hooks')
  const page = join(SRC, 'components', 'settings', 'ridgePage.tsx')
  return [
    ...filesUnder(join(SRC, 'components', 'settings', 'ridge')),
    ...readdirSync(hooks).filter((name) => name.startsWith('useRidge')).map((name) => join(hooks, name)),
    ...(existsSync(page) ? [page] : []),
  ].filter((file) => SOURCE_EXTENSION.test(file) && !TEST_FILE.test(file))
}

function refusedImports(file: string): string[] {
  return relativeSpecifiers(readFileSync(file, 'utf8'))
    .map((specifier) => toSrcPath(resolve(dirname(file), specifier)))
    .filter(isRefusedModule)
    .map((module) => `${toSrcPath(file)} imports ${module}`)
}

describe('the Ridge import boundary', () => {
  it.each([
    'components/topbar/faces/clockFace',
    'components/topbar/faces/trayFace',
    'components/topbar/topbarSurface',
    'components/topbar/layout/topbarLayout',
    'components/topbar/layout/topbarLayoutEdits',
    'components/topbar/tray/composeTray',
    'components/topbar/calendar/calendarLayout',
    'components/settings/ridge/ridgeSamples',
    'hooks/useMediaSession',
  ])('lets Ridge import %s', (module) => {
    expect(isRefusedModule(module)).toBe(false)
  })

  it.each([
    'components/topbar/topBar',
    'components/topbar/systemTray',
    'components/topbar/systemMenu',
    'components/topbar/launcherTrigger',
    'components/topbar/launcher/launcherPanel',
    'components/topbar/windowSwitcherPanel',
    'components/topbar/displayModePanel',
    'components/topbar/smartScreenPanel',
    'components/topbar/noticeStrip',
    'components/topbar/pluginSlot',
    'components/topbar/shared/popupMenu',
    'components/topbar/status/statusIndicator',
    'components/topbar/chrome/ChromeCanvas',
    'components/topbar/engine/topbarEngine',
    'components/topbar/layout/topbarLayout.test',
    'hooks/useAudioPeak',
    'hooks/useTrayDisplay',
    'hooks/useShellNotice',
  ])('refuses to let Ridge import %s', (module) => {
    expect(isRefusedModule(module)).toBe(true)
  })

  it('reads static, type-only, re-exported, side-effect and dynamic imports alike', () => {
    const source = [
      "import ClockFace from '../../topbar/faces/clockFace'",
      "import type { Sample } from './ridgeSamples'",
      "export { RIDGE_ITEM_PREVIEWS } from './ridgeItemPreviewMap'",
      "import './ridge.css'",
      "const tray = import('../../topbar/systemTray')",
      "import { useMemo } from 'react'",
    ].join('\n')
    expect(relativeSpecifiers(source)).toEqual([
      '../../topbar/faces/clockFace',
      './ridgeSamples',
      './ridgeItemPreviewMap',
      './ridge.css',
      '../../topbar/systemTray',
    ])
  })

  it('guards the Ridge sources and hooks, leaving their tests out', () => {
    const guarded = ridgeSourceFiles().map(toSrcPath)
    expect(guarded).toEqual(
      expect.arrayContaining([
        'components/settings/ridge/ridgeItemPreviews',
        'components/settings/ridge/ridgeItemPreviewMap',
        'hooks/useRidgePreviewData',
        'hooks/useRidgePluginWidgets',
      ])
    )
    expect(guarded.filter((file) => file.endsWith('.test'))).toEqual([])
  })

  it('keeps every Ridge source inside the allowlist', () => {
    expect(ridgeSourceFiles().flatMap(refusedImports)).toEqual([])
  })
})

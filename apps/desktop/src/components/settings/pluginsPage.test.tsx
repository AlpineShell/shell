import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import PluginsPage from './pluginsPage'
import { ridgePluginRecord } from './ridge/ridgeTestFixtures'

const WIND: PluginSettingDeclaration = { key: 'show-wind', type: 'toggle', label: 'Show wind', default: false }

const SETTINGS_BUTTON = 'Weather settings'

const NOTES: MarketplacePlugin = {
  id: 'com.example.notes',
  name: 'Notes',
  version: '2.0.0',
  shortDescription: 'Notes in the ridge',
  description: '',
  category: null,
  iconUrl: null,
  author: null,
  verified: true,
  apiVersion: 1,
  size: null,
}

interface MarketplaceBridges {
  listed?: MarketplacePlugin[]
  detail?: MarketplacePlugin | null
  install?: () => Promise<InstallResult>
  uninstall?: () => Promise<{ ok: boolean; error?: string }>
}

let deliverDeepInstall: (request: DeepInstallRequest) => void = () => {}

function installBridges(records: PluginRecord[], marketplace: MarketplaceBridges = {}) {
  Object.assign(window, {
    plugins: {
      list: vi.fn().mockResolvedValue(records),
      openFolder: vi.fn(),
      reload: vi.fn(),
      setEnabled: vi.fn(),
      onDeepInstall: vi.fn((callback: (request: DeepInstallRequest) => void) => {
        deliverDeepInstall = callback
        return () => {}
      }),
      marketplace: {
        list: vi.fn().mockResolvedValue({ base: '', plugins: marketplace.listed ?? [] }),
        base: vi.fn().mockResolvedValue(''),
        detail: vi.fn().mockResolvedValue(marketplace.detail ?? null),
        install: vi.fn(marketplace.install ?? (async () => ({ ok: true, id: NOTES.id, version: NOTES.version, verified: true }))),
        uninstall: vi.fn(marketplace.uninstall ?? (async () => ({ ok: true }))),
        openWeb: vi.fn(),
      },
    },
  })
}

async function openPage(records: PluginRecord[], marketplace: MarketplaceBridges = {}) {
  installBridges(records, marketplace)
  const onNavigate = vi.fn()
  render(<PluginsPage onNavigate={onNavigate} />)
  await act(async () => {})
  return onNavigate
}

afterEach(() => {
  delete (window as unknown as { plugins?: unknown }).plugins
})

describe('the settings button on the Plugins page', () => {
  it("opens the plugin's settings page", async () => {
    const onNavigate = await openPage([ridgePluginRecord({ contributes: { settings: [WIND] } })])
    fireEvent.click(screen.getByRole('button', { name: SETTINGS_BUTTON }))
    expect(onNavigate).toHaveBeenCalledWith('plugins/com.example.weather')
  })

  it('shows for a plugin that declares only a settings page', async () => {
    await openPage([ridgePluginRecord({ contributes: { settingsPages: [{ label: 'Weather', export: 'WeatherSettings' }] } })])
    expect(screen.getByRole('button', { name: SETTINGS_BUTTON })).toBeTruthy()
  })

  it('stays away from a plugin with nothing to set', async () => {
    await openPage([ridgePluginRecord()])
    expect(screen.queryByRole('button', { name: SETTINGS_BUTTON })).toBeNull()
  })

  it('stays away from a plugin that cannot load', async () => {
    await openPage([ridgePluginRecord({ loadable: false, contributes: { settings: [WIND] } })])
    expect(screen.queryByRole('button', { name: SETTINGS_BUTTON })).toBeNull()
  })
})

describe('an install link from the web', () => {
  it('opens Browse on the plugin and installs nothing until Install is clicked', async () => {
    await openPage([], { listed: [NOTES] })
    await act(async () => deliverDeepInstall({ id: NOTES.id, version: '' }))
    const installButton = screen.getByRole('button', { name: 'Install' })
    expect(installButton.closest('li')?.className).toContain('ring-1')
    expect(window.plugins.marketplace.install).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(installButton))
    expect(window.plugins.marketplace.install).toHaveBeenCalledWith({ id: NOTES.id, version: NOTES.version })
  })

  it('shows a plugin the list does not carry from its catalog entry, still without installing it', async () => {
    await openPage([], { listed: [], detail: NOTES })
    await act(async () => deliverDeepInstall({ id: NOTES.id, version: '' }))
    expect(window.plugins.marketplace.detail).toHaveBeenCalledWith(NOTES.id)
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy()
    expect(window.plugins.marketplace.install).not.toHaveBeenCalled()
  })
})

describe('install and uninstall failures', () => {
  it('says so when a bundle is refused for its signature', async () => {
    await openPage([], { listed: [NOTES], install: async () => ({ ok: false, error: 'unverified' }) })
    fireEvent.click(screen.getByRole('radio', { name: /Browse/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install' })))
    expect(screen.getByText('Not installed: its signature could not be verified.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy()
  })

  it('says so when an update cannot replace the files', async () => {
    await openPage([], { listed: [NOTES], install: async () => ({ ok: false, error: 'install-failed' }) })
    fireEvent.click(screen.getByRole('radio', { name: /Browse/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install' })))
    expect(screen.getByText("Couldn't install. Try again.")).toBeTruthy()
  })

  it('says so when an uninstall fails', async () => {
    await openPage([ridgePluginRecord()], { uninstall: async () => ({ ok: false, error: 'remove-failed' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Uninstall Weather' })))
    expect(window.plugins.marketplace.uninstall).toHaveBeenCalledWith('com.example.weather')
    expect(screen.getByText("Couldn't uninstall. Try again.")).toBeTruthy()
  })
})

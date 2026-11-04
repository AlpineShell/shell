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
  githubResolve?: () => Promise<GithubResolveResult>
}

const RELEASE: GithubPluginRelease = {
  owner: 'octo',
  repo: 'notes',
  tag: 'v1.2.0',
  commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  assetName: 'notes-1.2.0.alpineplugin',
  size: 2048,
}

let deliverDeepInstall: (request: DeepInstallRequest) => void = () => {}

function installBridges(records: PluginRecord[], marketplace: MarketplaceBridges = {}) {
  Object.assign(window, {
    plugins: {
      list: vi.fn().mockResolvedValue(records),
      openFolder: vi.fn(),
      reload: vi.fn(),
      setEnabled: vi.fn(),
      trust: vi.fn().mockResolvedValue(true),
      onReload: vi.fn(() => () => {}),
      github: {
        resolve: vi.fn(marketplace.githubResolve ?? (async () => ({ ok: true, token: 'confirm-token', release: RELEASE }))),
        install: vi.fn(async () => ({ ok: true, id: 'com.octo.notes', version: '1.2.0', repository: 'octo/notes', tag: 'v1.2.0', commit: RELEASE.commit, sha256: 'f'.repeat(64) })),
      },
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

  it('refuses to update over a plugin installed from outside the store', async () => {
    await openPage([ridgePluginRecord({ id: NOTES.id, name: 'Notes', version: '1.0.0', source: 'github', updatesFromStore: false })], { listed: [NOTES] })
    fireEvent.click(screen.getByRole('radio', { name: /Browse/ }))
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('says so when an uninstall fails', async () => {
    await openPage([ridgePluginRecord()], { uninstall: async () => ({ ok: false, error: 'remove-failed' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Uninstall Weather' })))
    expect(window.plugins.marketplace.uninstall).toHaveBeenCalledWith('com.example.weather')
    expect(screen.getByText("Couldn't uninstall. Try again.")).toBeTruthy()
  })
})

describe('plugins that are not from the store', () => {
  const FOLDER_WARNING = 'This plugin is not from the Alpine Shell store. Only turn it on if you trust who made it.'

  it('asks before turning on a plugin dropped into the plugins folder', async () => {
    await openPage([ridgePluginRecord({ loadable: false, source: 'folder', needsTrust: { source: 'folder' } })])
    expect(screen.getByText(FOLDER_WARNING)).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Enable Weather' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(window.plugins.trust).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Turn on Weather' })))
    expect(window.plugins.trust).toHaveBeenCalledWith('com.example.weather')
  })

  it('shows a revoked plugin as turned off by Alpine Shell, with the reason', async () => {
    await openPage([ridgePluginRecord({ loadable: false, source: 'store', revoked: { reason: 'It sends your files away.' } })])
    expect(screen.getByText('Turned off by Alpine Shell: It sends your files away.')).toBeTruthy()
    expect(screen.queryByText(FOLDER_WARNING)).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Enable Weather' })).toBeNull()
  })
})

describe('installing from GitHub', () => {
  async function openForm(marketplace: MarketplaceBridges = {}) {
    await openPage([], marketplace)
    fireEvent.click(screen.getByRole('button', { name: 'Install from GitHub' }))
    fireEvent.change(screen.getByLabelText('GitHub release link'), { target: { value: 'https://github.com/octo/notes/releases/tag/v1.2.0' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
  }

  it('shows where the plugin comes from before installing it', async () => {
    await openForm()
    expect(window.plugins.github.resolve).toHaveBeenCalledWith('https://github.com/octo/notes/releases/tag/v1.2.0')
    expect(window.plugins.github.install).not.toHaveBeenCalled()
    expect(screen.getByText('Not reviewed by Alpine Shell')).toBeTruthy()
    expect(screen.getByText('octo')).toBeTruthy()
    expect(screen.getByText('notes')).toBeTruthy()
    expect(screen.getByText('v1.2.0')).toBeTruthy()
    expect(screen.getByText('a1b2c3d')).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install' })))
    expect(window.plugins.github.install).toHaveBeenCalledWith('confirm-token')
    expect(screen.queryByText('Not reviewed by Alpine Shell')).toBeNull()
    expect(window.plugins.list).toHaveBeenCalledTimes(2)
  })

  it('says what is wrong with the link', async () => {
    await openForm({ githubResolve: async () => ({ ok: false, error: 'no-bundle' }) })
    expect(screen.getByText('That release has no .alpineplugin file.')).toBeTruthy()
    expect(window.plugins.github.install).not.toHaveBeenCalled()
  })
})

describe('a plugin from a community publisher', () => {
  it('names the publisher in the store', async () => {
    await openPage([], { listed: [{ ...NOTES, publisher: { slug: 'octo', name: 'Octo Labs' }, community: true }] })
    fireEvent.click(screen.getByRole('radio', { name: /Browse/ }))
    expect(screen.getByText(/by Octo Labs/)).toBeTruthy()
  })
})

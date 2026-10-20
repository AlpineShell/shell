import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import AppsHub from './appsHub'
import { stubAppsBridge } from './appsTestBridge'

const APPS_PAGES = ['apps-installed', 'apps-startup', 'apps-running', 'apps-defaults'] as const

function installedApp(name: string, isComponent: boolean): InstalledApp {
  return { id: name, name, publisher: null, version: null, icon: null, source: 'desktop', isComponent, startupId: null, canUninstall: true, canOpen: true, canOpenLocation: true }
}

function startupEntry(name: string, enabled: boolean, category: StartupEntry['category'], pending: StartupEntry['pending'] = null): StartupEntry {
  return { id: name, name, friendlyName: name, blurb: null, category, locked: false, command: name, target: null, icon: null, source: 'registry', sourceLabel: '', scope: 'user', enabled, pending, running: false, location: '', missing: false }
}

function runningApp(name: string, category: RunningApp['category']): RunningApp {
  return { name, friendlyName: name, category, band: 'light', path: null, icon: null, memory: 0, cpu: 0, count: 1, pids: [1], hasWindow: true }
}

beforeEach(() => {
  stubAppsBridge()
})

afterEach(() => {
  delete (window as unknown as { shell?: unknown }).shell
})

describe('AppsHub', () => {
  it('heads itself with the label the breadcrumb and the search result read', () => {
    render(<AppsHub onNavigate={() => {}} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(settingsPage('apps')!.label)
  })

  it('names each row the way the breadcrumb and the search result name that page', () => {
    render(<AppsHub onNavigate={() => {}} />)
    for (const page of APPS_PAGES) {
      expect(screen.getByRole('button', { name: new RegExp(`^${settingsPage(page)!.label}`) })).toBeTruthy()
    }
  })

  it('counts what each page lists: apps without components, startup apps that will start, and apps that are not Windows', async () => {
    const apps = (window as unknown as { shell: { apps: Record<string, unknown> } }).shell.apps
    apps.installed = () => Promise.resolve([installedApp('Discord', false), installedApp('Spotify', false), installedApp('VC++ Runtime', true)])
    apps.startup = () =>
      Promise.resolve([
        startupEntry('Discord', true, 'app'),
        startupEntry('Steam', false, 'app', 'enable'),
        startupEntry('Spotify', true, 'app', 'disable'),
        startupEntry('Security', true, 'system'),
      ])
    apps.running = () => Promise.resolve([runningApp('Chrome', 'app'), runningApp('svchost', 'system')])
    render(<AppsHub onNavigate={() => {}} />)
    expect(await screen.findByText('2 on')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Installed apps/ }).textContent).toContain('2')
    expect(screen.getByRole('button', { name: /^Running apps/ }).textContent).toContain('1')
  })
})

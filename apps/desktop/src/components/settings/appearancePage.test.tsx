import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { settingsPage, settingsPageRoute } from '../../settings/registry'

let AppearancePage: typeof import('./appearancePage').default

const BRIDGE_ROOTS = ['shell', 'topbar']

const THEME: ThemeState = { name: 'dark', background: '#1e1e1e', preference: 'topbar' }

function installBridges() {
  const theme = {
    initial: THEME,
    get: vi.fn(() => Promise.resolve(THEME)),
    setPreference: vi.fn((preference: ThemePreference) => Promise.resolve({ ...THEME, preference })),
    onChanged: vi.fn(() => () => {}),
  }
  const topbar = {
    colorOverride: vi.fn(() => Promise.resolve(null)),
    colorPalette: vi.fn(() => Promise.resolve([])),
    onColorChanged: vi.fn(() => () => {}),
    setColorOverride: vi.fn(() => Promise.resolve(null)),
  }
  Object.assign(window, { shell: { theme }, topbar })
}

async function openPage() {
  const onNavigate = vi.fn()
  render(<AppearancePage onNavigate={onNavigate} />)
  await act(async () => {})
  return onNavigate
}

function groupTitles(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '')
}

beforeEach(async () => {
  vi.resetModules()
  installBridges()
  AppearancePage = (await import('./appearancePage')).default
})

afterEach(() => {
  const bridges = window as unknown as Record<string, unknown>
  for (const root of BRIDGE_ROOTS) delete bridges[root]
})

describe('AppearancePage', () => {
  it('opens Ridge from Arrange Ridge', async () => {
    const onNavigate = await openPage()
    fireEvent.click(screen.getByRole('button', { name: /^Arrange Ridge/ }))
    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute('ridge'))
    expect(settingsPageRoute('ridge')).toBe('ridge')
  })

  it('holds Theme, Color and a group named after Ridge, and no Top bar group', async () => {
    await openPage()
    expect(groupTitles()).toEqual(['Theme', 'Color', settingsPage('ridge')?.label])
    expect(groupTitles()).not.toContain('Top bar')
  })

  it('offers Ridge as the first theme', async () => {
    await openPage()
    const themes = within(screen.getByRole('radiogroup', { name: 'Theme' })).getAllByRole('radio')
    expect(themes[0].textContent).toBe('Ridge')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import PluginErrorBoundary from '../components/topbar/pluginErrorBoundary'
import RidgePluginBoundary from '../components/settings/ridge/ridgePluginBoundary'
import PluginPageBoundary from '../components/settings/pluginPageBoundary'

function Broken(): never {
  throw new TypeError('forecast is undefined')
}

const reportWidgetError = vi.fn(async () => true)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.assign(window, { plugins: { reportWidgetError } })
})

afterEach(() => {
  vi.restoreAllMocks()
  reportWidgetError.mockClear()
  delete (window as unknown as { plugins?: unknown }).plugins
})

const CRASH = { id: 'com.example.weather', message: 'forecast is undefined', stack: expect.stringContaining('forecast is undefined') }

describe('a plugin component that throws', () => {
  it('is reported from the Ridge under its plugin id', () => {
    render(
      <PluginErrorBoundary id="com.example.weather:Forecast">
        <Broken />
      </PluginErrorBoundary>,
    )
    expect(reportWidgetError).toHaveBeenCalledWith(CRASH)
  })

  it('is reported from the Ridge page preview under its plugin id', () => {
    render(
      <RidgePluginBoundary id="com.example.weather:Forecast">
        <Broken />
      </RidgePluginBoundary>,
    )
    expect(reportWidgetError).toHaveBeenCalledWith(CRASH)
  })

  it('is reported from a plugin settings page', () => {
    render(
      <PluginPageBoundary id="com.example.weather" fallback={null}>
        <Broken />
      </PluginPageBoundary>,
    )
    expect(reportWidgetError).toHaveBeenCalledWith(CRASH)
  })

  it('still falls back quietly when the report cannot be sent', () => {
    delete (window as unknown as { plugins?: unknown }).plugins
    const { container } = render(
      <PluginErrorBoundary id="com.example.weather:Forecast">
        <Broken />
      </PluginErrorBoundary>,
    )
    expect(container.innerHTML).toBe('')
  })
})

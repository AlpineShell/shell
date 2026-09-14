import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RidgeAddMenu from './ridgeAddMenu'
import { liveRidgePreviewData, ridgePluginWidget } from './ridgeTestFixtures'

const NOTHING_HIDDEN = 'Everything is already on Ridge.'

const WEATHER_LOGO = 'alpine-plugin://com.example.weather/logo.png'

function openAddMenu(items: TopbarItemId[], previewData: RidgePreviewData = liveRidgePreviewData()) {
  const handlers = { onSelect: vi.fn(), onDismiss: vi.fn() }
  render(<RidgeAddMenu items={items} previewData={previewData} {...handlers} />)
  return handlers
}

function optionLabels(): string[] {
  return screen.queryAllByRole('option').map((option) => option.textContent ?? '')
}

function withWeatherLogo(): RidgePreviewData {
  const live = liveRidgePreviewData()
  return { ...live, plugins: { ...live.plugins, left: [{ ...ridgePluginWidget('left', 'Weather'), pluginIcon: WEATHER_LOGO }] } }
}

describe('RidgeAddMenu', () => {
  it('offers the hidden items under their Ridge names, and a plugin group under its plugins', () => {
    openAddMenu(['media', 'tray', 'plugins-left'])
    expect(optionLabels()).toEqual(['Media', 'System tray', 'Weather'])
  })

  it('shows a plugin group with its plugin logo', () => {
    openAddMenu(['plugins-left'], withWeatherLogo())
    expect(screen.getByRole('option', { name: 'Weather' }).querySelector('img')?.getAttribute('src')).toBe(WEATHER_LOGO)
  })

  it('starts in its search field, ready to type', () => {
    openAddMenu(['media'])
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
  })

  it('adds the highlighted item when Enter is pressed', () => {
    const { onSelect } = openAddMenu(['media', 'tray'])
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('tray')
  })

  it('adds an item found by typing its name', () => {
    const { onSelect } = openAddMenu(['media', 'microphone', 'clock'])
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'micro' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('microphone')
  })

  it('adds an item that is clicked', () => {
    const { onSelect } = openAddMenu(['media', 'clock'])
    fireEvent.click(screen.getByRole('option', { name: 'Clock' }))
    expect(onSelect).toHaveBeenCalledWith('clock')
  })

  it('backs out once on Escape, adding nothing', () => {
    const { onDismiss, onSelect } = openAddMenu(['media'])
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('says everything is already on Ridge when nothing is hidden, and moves focus to say so', () => {
    openAddMenu([])
    const message = screen.getByText(NOTHING_HIDDEN)
    expect(document.activeElement).toBe(message)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('backs out on Escape when nothing is hidden', () => {
    const { onDismiss } = openAddMenu([])
    fireEvent.keyDown(screen.getByText(NOTHING_HIDDEN), { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('leaves other keys alone', () => {
    const { onDismiss } = openAddMenu([])
    fireEvent.keyDown(screen.getByText(NOTHING_HIDDEN), { key: 'Enter' })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('offers nothing but its hidden items, with no button of its own', () => {
    openAddMenu(['media'])
    expect(optionLabels()).toEqual(['Media'])
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('has no button of its own when nothing is hidden either', () => {
    openAddMenu([])
    expect(screen.queryAllByRole('button')).toEqual([])
  })
})

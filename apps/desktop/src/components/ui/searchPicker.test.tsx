import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import SearchPicker from './searchPicker'

const LAYOUTS: SearchPickerOption[] = [
  { value: '00000409', label: 'US' },
  { value: '0000040c', label: 'French' },
  { value: '0000080c', label: 'Belgian French' },
  { value: '00000807', label: 'Swiss German' },
  { value: '00000407', label: 'German' },
]

function open(props: Partial<SearchPickerProps> = {}) {
  const onSelect = vi.fn()
  const onDismiss = vi.fn()
  render(
    <SearchPicker
      options={LAYOUTS}
      onSelect={onSelect}
      onDismiss={onDismiss}
      label="Add a keyboard layout"
      {...props}
    />
  )
  return { onSelect, onDismiss, input: screen.getByRole('combobox') }
}

function optionLabels(): string[] {
  return screen.queryAllByRole('option').map((option) => option.textContent ?? '')
}

describe('SearchPicker', () => {
  it('offers every option before anything is typed', () => {
    open()
    expect(optionLabels()).toEqual(['US', 'French', 'Belgian French', 'Swiss German', 'German'])
  })

  it('narrows a catalogue too long to scan down to what was typed', () => {
    const { input } = open()
    fireEvent.change(input, { target: { value: 'french' } })
    expect(optionLabels()).toEqual(['French', 'Belgian French'])
  })

  it('ranks the whole label above a word buried in the middle of another', () => {
    const { input } = open()
    fireEvent.change(input, { target: { value: 'german' } })
    expect(optionLabels()[0]).toBe('German')
  })

  it('reports the option under the cursor to a screen reader', () => {
    const { input } = open()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const active = input.getAttribute('aria-activedescendant')
    expect(screen.queryAllByRole('option')[1].id).toBe(active)
  })

  it('picks the highlighted option on Enter', () => {
    const { input, onSelect } = open()
    fireEvent.change(input, { target: { value: 'french' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('0000080c')
  })

  it('wraps around the ends of the list rather than sticking', () => {
    const { input, onSelect } = open()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('00000407')
  })

  it('picks an option that is clicked', () => {
    const { onSelect } = open()
    screen.getByRole('option', { name: 'Swiss German' }).click()
    expect(onSelect).toHaveBeenCalledWith('00000807')
  })

  it('refuses an option that cannot be picked', () => {
    const { onSelect } = open({ options: [{ value: '00000409', label: 'US', disabled: true }] })
    screen.getByRole('option', { name: 'US' }).click()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('says so rather than showing an empty box when nothing matches', () => {
    const { input, onSelect } = open({ emptyMessage: 'No installed layout matches that.' })
    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(optionLabels()).toEqual([])
    expect(screen.getByText('No installed layout matches that.')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('backs out on Escape', () => {
    const { input, onDismiss } = open()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

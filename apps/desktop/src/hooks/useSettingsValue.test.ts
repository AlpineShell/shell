import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { Circle } from 'lucide-react'
import { useSettingsValue } from './useSettingsValue'

interface StubOptions {
  stored?: SettingsValue
  initial?: () => SettingsValue
  validate?: (value: unknown) => SettingsValue
  writeFails?: boolean
}

function stubEntry(options: StubOptions = {}) {
  let stored: SettingsValue = options.stored ?? false
  let push: ((value: SettingsValue) => void) | undefined

  const entry: SettingsValueEntry = {
    id: 'stub',
    label: 'Stub',
    description: 'A stub setting',
    keywords: ['stub', 'test'],
    icon: Circle,
    page: 'appearance',
    group: 'Stub',
    order: 0,
    applies: 'instant',
    defaultValue: false,
    control: { kind: 'toggle' },
    read: vi.fn(() => Promise.resolve(stored)),
    write: vi.fn((value: SettingsValue) => {
      if (options.writeFails) return Promise.reject(new Error('refused'))
      stored = value
      return Promise.resolve(value)
    }),
    subscribe: vi.fn((listener: (value: SettingsValue) => void) => {
      push = listener
    }),
    ...(options.initial ? { initial: options.initial } : {}),
    ...(options.validate ? { validate: options.validate } : {}),
  }

  return {
    entry,
    setStored: (value: SettingsValue) => {
      stored = value
    },
    broadcast: (value: SettingsValue) => push?.(value),
  }
}

describe('useSettingsValue', () => {
  it('starts from the default value and adopts what the entry reads', async () => {
    const { entry } = stubEntry({ stored: true })
    const { result } = renderHook(() => useSettingsValue(entry))

    expect(result.current.value).toBe(false)
    await waitFor(() => expect(result.current.value).toBe(true))
  })

  it('starts from the entry initial value when it has one', () => {
    const { entry } = stubEntry({ stored: false, initial: () => true })
    const { result } = renderHook(() => useSettingsValue(entry))

    expect(result.current.value).toBe(true)
  })

  it('validates values that arrive from the entry', async () => {
    const { entry, broadcast } = stubEntry({ stored: 'rubbish', validate: (value) => (value === 'dark' ? 'dark' : 'system') })
    const { result } = renderHook(() => useSettingsValue(entry))

    await waitFor(() => expect(result.current.value).toBe('system'))
    act(() => broadcast('dark'))
    expect(result.current.value).toBe('dark')
  })

  it('reads and subscribes once however many components use the entry', async () => {
    const { entry } = stubEntry({ stored: true })
    const first = renderHook(() => useSettingsValue(entry))
    renderHook(() => useSettingsValue(entry))

    await waitFor(() => expect(first.result.current.value).toBe(true))
    expect(entry.read).toHaveBeenCalledTimes(1)
    expect(entry.subscribe).toHaveBeenCalledTimes(1)
  })

  it('shows an optimistic write to every component reading the entry', () => {
    const { entry } = stubEntry()
    const writer = renderHook(() => useSettingsValue(entry))
    const reader = renderHook(() => useSettingsValue(entry))

    act(() => writer.result.current.write(true))

    expect(writer.result.current.value).toBe(true)
    expect(reader.result.current.value).toBe(true)
  })

  it('keeps the value when a component remounts', async () => {
    const { entry } = stubEntry({ stored: true })
    const first = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(first.result.current.value).toBe(true))
    first.unmount()

    const second = renderHook(() => useSettingsValue(entry))
    expect(second.result.current.value).toBe(true)
  })

  it('ignores a broadcast that arrives while a write is in flight', async () => {
    const { entry, broadcast } = stubEntry({ stored: 20 })
    const { result } = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(result.current.value).toBe(20))

    act(() => result.current.write(60))
    act(() => broadcast(20))

    expect(result.current.value).toBe(60)
  })

  it('takes broadcasts again once the write settles', async () => {
    const { entry, broadcast } = stubEntry({ stored: 20 })
    const { result } = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(result.current.value).toBe(20))

    await act(async () => {
      result.current.write(60)
      await Promise.resolve()
    })
    act(() => broadcast(35))

    expect(result.current.value).toBe(35)
  })

  it('falls back to what the entry reads when a write is refused', async () => {
    const { entry, setStored } = stubEntry({ stored: false, writeFails: true })
    const { result } = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(result.current.value).toBe(false))

    setStored(false)
    await act(async () => {
      result.current.write(true)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.value).toBe(false))
  })
})

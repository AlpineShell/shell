import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { Circle } from 'lucide-react'
import { useSettingsValue, writeSettingsValue } from './useSettingsValue'

interface StubOptions {
  stored?: SettingsValue
  initial?: () => SettingsValue
  validate?: (value: unknown) => SettingsValue
  writeFails?: string | boolean
  applies?: SettingsApplies
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
    applies: options.applies ?? 'instant',
    defaultValue: false,
    control: { kind: 'toggle' },
    read: vi.fn(() => Promise.resolve(stored)),
    write: vi.fn((value: SettingsValue) => {
      if (options.writeFails) return Promise.reject(new Error(String(options.writeFails)))
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

  it('writes an instant entry the moment the control changes', () => {
    const { entry } = stubEntry()
    const { result } = renderHook(() => useSettingsValue(entry))

    act(() => result.current.write(true))

    expect(entry.write).toHaveBeenCalledWith(true)
    expect(result.current.value).toBe(true)
  })

  it('does not write a confirm entry until it is confirmed', async () => {
    const { entry } = stubEntry({ applies: 'confirm' })
    const { result } = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(result.current.value).toBe(false))

    act(() => result.current.write(true))

    expect(entry.write).not.toHaveBeenCalled()
    expect(result.current.value).toBe(false)
    expect(result.current.staged).toBe(true)

    act(() => result.current.confirm())

    expect(entry.write).toHaveBeenCalledWith(true)
    expect(result.current.value).toBe(true)
    expect(result.current.staged).toBeUndefined()
  })

  it('drops the staged value of a confirm entry when it is cancelled', () => {
    const { entry } = stubEntry({ applies: 'confirm' })
    const { result } = renderHook(() => useSettingsValue(entry))

    act(() => result.current.write(true))
    act(() => result.current.cancel())

    expect(entry.write).not.toHaveBeenCalled()
    expect(result.current.staged).toBeUndefined()
    expect(result.current.value).toBe(false)
  })

  it('confirms nothing when a confirm entry has nothing staged', () => {
    const { entry } = stubEntry({ applies: 'confirm' })
    const { result } = renderHook(() => useSettingsValue(entry))

    act(() => result.current.confirm())

    expect(entry.write).not.toHaveBeenCalled()
  })

  it('leaves a draft entry for the page to apply', () => {
    const { entry } = stubEntry({ applies: 'draft' })
    const { result } = renderHook(() => useSettingsValue(entry))

    act(() => result.current.write(true))

    expect(entry.write).not.toHaveBeenCalled()
    expect(result.current.staged).toBe(true)
  })

  it('writes a restart entry and asks for a restart once it lands', async () => {
    const { entry } = stubEntry({ applies: 'restart' })
    const { result } = renderHook(() => useSettingsValue(entry))

    act(() => result.current.write(true))

    expect(entry.write).toHaveBeenCalledWith(true)
    expect(result.current.value).toBe(true)
    await waitFor(() => expect(result.current.restartRequired).toBe(true))
  })

  it('reverts the optimistic value and says why when a write is refused', async () => {
    const { entry } = stubEntry({ stored: false, writeFails: 'Another app already owns that shortcut.' })
    const { result } = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(result.current.value).toBe(false))

    act(() => result.current.write(true))
    expect(result.current.value).toBe(true)

    await waitFor(() => expect(result.current.value).toBe(false))
    expect(result.current.error).toBe('Another app already owns that shortcut.')
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

describe('writeSettingsValue', () => {
  it('resolves true once the entry has written the value', async () => {
    const { entry } = stubEntry()

    await expect(writeSettingsValue(entry, true)).resolves.toBe(true)
    expect(entry.write).toHaveBeenCalledWith(true)
  })

  it('resolves false when the entry refuses the write', async () => {
    const { entry } = stubEntry({ writeFails: 'Another app already owns that shortcut.' })

    await expect(writeSettingsValue(entry, true)).resolves.toBe(false)
  })

  it('resolves only after it has read back the value a refused write left behind', async () => {
    const { entry } = stubEntry({ stored: false, writeFails: true })
    const { result } = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(result.current.value).toBe(false))

    let written: boolean | undefined
    await act(async () => {
      written = await writeSettingsValue(entry, true)
    })

    expect(written).toBe(false)
    expect(entry.read).toHaveBeenCalledTimes(2)
    expect(result.current.value).toBe(false)
  })

  it('resolves false for a confirm entry, which only stages the value', async () => {
    const { entry } = stubEntry({ applies: 'confirm' })

    await expect(writeSettingsValue(entry, true)).resolves.toBe(false)
    expect(entry.write).not.toHaveBeenCalled()
  })

  it('resolves false when the entry throws before its write starts', async () => {
    const { entry } = stubEntry()
    vi.mocked(entry.write).mockImplementation(() => {
      throw new Error('The bridge is missing.')
    })

    await expect(writeSettingsValue(entry, true)).resolves.toBe(false)
  })

  it('takes broadcasts again by the time it resolves', async () => {
    const { entry, broadcast } = stubEntry({ stored: 20 })
    const { result } = renderHook(() => useSettingsValue(entry))
    await waitFor(() => expect(result.current.value).toBe(20))

    await act(async () => {
      await writeSettingsValue(entry, 60)
    })
    act(() => broadcast(35))

    expect(result.current.value).toBe(35)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBluetoothRescan } from './useBluetoothRescan'

function installRefresh() {
  const answers: Array<() => void> = []
  const bluetoothRefresh = vi.fn(() => new Promise<void>((resolve) => answers.push(resolve)))
  ;(window as unknown as { shell: unknown }).shell = { system: { bluetoothRefresh } }
  return { bluetoothRefresh, answerLatest: () => answers.at(-1)?.() }
}

afterEach(() => {
  delete (window as unknown as { shell?: unknown }).shell
})

describe('useBluetoothRescan', () => {
  it('refreshes once when mounted without showing the spinner', () => {
    const { bluetoothRefresh } = installRefresh()

    const { result } = renderHook(() => useBluetoothRescan())

    expect(bluetoothRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.refreshing).toBe(false)
  })

  it('shows the spinner until a rescan answers', async () => {
    const { bluetoothRefresh, answerLatest } = installRefresh()
    const { result } = renderHook(() => useBluetoothRescan())

    act(() => result.current.rescan())

    expect(bluetoothRefresh).toHaveBeenCalledTimes(2)
    expect(result.current.refreshing).toBe(true)

    await act(async () => answerLatest())

    expect(result.current.refreshing).toBe(false)
  })
})

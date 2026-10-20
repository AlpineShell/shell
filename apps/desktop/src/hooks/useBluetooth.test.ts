import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBluetooth } from './useBluetooth'
import { UNKNOWN_BLUETOOTH_STATE } from '../lib/bluetoothPresentation'

function stateNamed(name: string, overrides: Partial<BluetoothDevice> = {}): BluetoothState {
  return {
    radio: { state: 'on', pending: null, error: null },
    devices: [{ id: name, name, kind: 'headphones', connected: false, canConnect: true, canDisconnect: false, audioDisabled: false, pending: null, error: null, ...overrides }],
    devicesAvailable: true,
  }
}

function installShell(boot: BluetoothState | null | undefined) {
  let pushed: ((data: BluetoothState) => void) | undefined
  const unsubscribe = vi.fn()
  const system = {
    bluetooth: vi.fn(() => new Promise<BluetoothState>(() => {})),
    onBluetoothChanged: vi.fn((callback: (data: BluetoothState) => void) => {
      pushed = callback
      return unsubscribe
    }),
    bluetoothConnect: vi.fn(() => Promise.resolve({ accepted: true })),
    bluetoothDisconnect: vi.fn(() => Promise.resolve({ accepted: true })),
  }
  ;(window as unknown as { shell: unknown }).shell = { system }
  if (boot !== undefined) {
    ;(window as unknown as { alpineBoot: unknown }).alpineBoot = { bluetooth: () => boot, wallpaper: () => null, wifi: () => null }
  }
  return { system, unsubscribe, push: (data: BluetoothState) => pushed?.(data) }
}

afterEach(() => {
  delete (window as unknown as { shell?: unknown }).shell
  delete (window as unknown as { alpineBoot?: unknown }).alpineBoot
})

describe('useBluetooth', () => {
  it('starts from the boot state before the first fetch answers', () => {
    const boot = stateNamed('Buds')
    installShell(boot)

    const { result } = renderHook(() => useBluetooth())

    expect(result.current.state).toBe(boot)
  })

  it('starts from the unknown state when there is no boot state', () => {
    installShell(undefined)

    const { result } = renderHook(() => useBluetooth())

    expect(result.current.state).toEqual(UNKNOWN_BLUETOOTH_STATE)
  })

  it('applies a pushed state', () => {
    const { push } = installShell(null)
    const { result } = renderHook(() => useBluetooth())
    const pushed = stateNamed('Speaker')

    act(() => push(pushed))

    expect(result.current.state).toBe(pushed)
  })

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = installShell(null)
    const { unmount } = renderHook(() => useBluetooth())

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('routes a toggle to connect or disconnect by the device state', () => {
    const { system } = installShell(null)
    const { result } = renderHook(() => useBluetooth())

    result.current.toggleDevice(stateNamed('Buds').devices[0])
    result.current.toggleDevice(stateNamed('Speaker', { connected: true, canDisconnect: true }).devices[0])

    expect(system.bluetoothConnect).toHaveBeenCalledWith('Buds')
    expect(system.bluetoothDisconnect).toHaveBeenCalledWith('Speaker')
  })
})

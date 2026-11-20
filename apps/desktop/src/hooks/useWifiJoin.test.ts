import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWifiJoin } from './useWifiJoin'

const OPEN_NETWORK: WifiNetwork = {
  ssid: 'Open network',
  signal: 70,
  security: 'open',
  secured: false,
  saved: false,
  connected: false,
  connectable: true,
}

const CONNECTED_NETWORK: WifiNetwork = { ...OPEN_NETWORK, connected: true }

function installShell() {
  const network = {
    wifiConnect: vi.fn<(...args: [string, string?, WifiConnectOptions?]) => Promise<WifiConnectResult>>(() => Promise.resolve({ success: true })),
    wifiDisconnect: vi.fn(() => Promise.resolve({ success: true })),
  }
  ;(window as unknown as { shell: unknown }).shell = { network }
  return network
}

afterEach(() => {
  delete (window as unknown as { shell?: unknown }).shell
})

describe('useWifiJoin', () => {
  it('connects to an open network without opening a password field', async () => {
    const network = installShell()
    const { result } = renderHook(() => useWifiJoin())

    await act(async () => result.current.activate(OPEN_NETWORK))

    expect(network.wifiConnect).toHaveBeenCalledWith('Open network')
    expect(result.current.passwordFor).toBeNull()
  })

  it('opens a password field when the network needs a password', async () => {
    const network = installShell()
    network.wifiConnect.mockResolvedValueOnce({ success: false, needsPassword: true })
    const { result } = renderHook(() => useWifiJoin())

    await act(async () => result.current.activate(OPEN_NETWORK))

    expect(result.current.passwordFor).toBe('Open network')
    expect(result.current.password).toBe('')
  })

  it('marks a password field when the backend reports a wrong password', async () => {
    const network = installShell()
    network.wifiConnect.mockResolvedValueOnce({ success: false, needsPassword: true, error: 'wrong-password' })
    const { result } = renderHook(() => useWifiJoin())

    await act(async () => result.current.activate(OPEN_NETWORK))

    expect(result.current.passwordFor).toBe('Open network')
    expect(result.current.wrongPasswordFor).toBe('Open network')
  })

  it('disconnects a connected network', async () => {
    const network = installShell()
    const { result } = renderHook(() => useWifiJoin())

    await act(async () => result.current.activate(CONNECTED_NETWORK))

    expect(network.wifiDisconnect).toHaveBeenCalledOnce()
    expect(network.wifiConnect).not.toHaveBeenCalled()
  })

  it('closes the password field after a successful submission', async () => {
    const network = installShell()
    network.wifiConnect.mockResolvedValueOnce({ success: false, needsPassword: true })
    const { result } = renderHook(() => useWifiJoin())

    await act(async () => result.current.activate(OPEN_NETWORK))
    act(() => result.current.setPassword('password123'))
    await act(async () => result.current.submitPassword())

    expect(network.wifiConnect).toHaveBeenNthCalledWith(2, 'Open network', 'password123')
    expect(result.current.passwordFor).toBeNull()
    expect(result.current.password).toBe('')
  })

  it('collects enterprise credentials and retries without server verification on connectAnyway', async () => {
    const enterpriseNetwork: WifiNetwork = { ...OPEN_NETWORK, ssid: 'BBW_BMSW', security: 'enterprise', secured: true }
    const network = installShell()
    network.wifiConnect
      .mockResolvedValueOnce({ success: false, needsPassword: true, needsUsername: true })
      .mockResolvedValueOnce({ success: false, error: 'untrusted-server' })
      .mockResolvedValueOnce({ success: false, needsPassword: true, needsUsername: true, error: 'wrong-password' })
      .mockResolvedValueOnce({ success: true })
    const { result } = renderHook(() => useWifiJoin())

    await act(async () => result.current.activate(enterpriseNetwork))
    expect(result.current.passwordFor).toBe('BBW_BMSW')
    expect(result.current.needsUsername).toBe(true)
    expect(result.current.canSubmit).toBe(false)

    act(() => {
      result.current.setUsername('student@bbw.ch')
      result.current.setPassword('wrong')
    })
    expect(result.current.canSubmit).toBe(true)

    await act(async () => result.current.submitPassword())
    expect(network.wifiConnect).toHaveBeenNthCalledWith(2, 'BBW_BMSW', 'wrong', { username: 'student@bbw.ch', trustServer: false })
    expect(result.current.untrustedServerFor).toBe('BBW_BMSW')

    await act(async () => result.current.connectAnyway())
    expect(network.wifiConnect).toHaveBeenNthCalledWith(3, 'BBW_BMSW', 'wrong', { username: 'student@bbw.ch', trustServer: true })
    expect(result.current.untrustedServerFor).toBeNull()
    expect(result.current.wrongPasswordFor).toBe('BBW_BMSW')

    act(() => result.current.setPassword('correct'))
    await act(async () => result.current.submitPassword())
    expect(network.wifiConnect).toHaveBeenNthCalledWith(4, 'BBW_BMSW', 'correct', { username: 'student@bbw.ch', trustServer: true })
    expect(result.current.passwordFor).toBeNull()
    expect(result.current.username).toBe('')
  })

  it('clears the untrusted server prompt when credentials are edited', async () => {
    const enterpriseNetwork: WifiNetwork = { ...OPEN_NETWORK, ssid: 'BBW_BMSW', security: 'enterprise', secured: true }
    const network = installShell()
    network.wifiConnect
      .mockResolvedValueOnce({ success: false, needsPassword: true, needsUsername: true })
      .mockResolvedValueOnce({ success: false, error: 'untrusted-server' })
    const { result } = renderHook(() => useWifiJoin())

    await act(async () => result.current.activate(enterpriseNetwork))
    act(() => {
      result.current.setUsername('student@bbw.ch')
      result.current.setPassword('pw')
    })
    await act(async () => result.current.submitPassword())
    expect(result.current.untrustedServerFor).toBe('BBW_BMSW')

    act(() => result.current.setPassword('pw2'))
    expect(result.current.untrustedServerFor).toBeNull()
  })
})

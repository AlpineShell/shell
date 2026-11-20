import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WifiMenu from './wifiMenu'
import { ETHERNET_ONLY_TITLE } from '../../../lib/wifiPresentation'

const HOME: WifiNetwork = {
  ssid: 'Home',
  signal: 80,
  security: 'wpa2-personal',
  secured: true,
  saved: true,
  connected: false,
  connectable: true,
}

const WIFI_ON: WifiState = {
  radio: 'on',
  networks: [HOME],
  scanning: false,
  operation: null,
  lastError: null,
  ethernet: false,
  offForEthernet: false,
  blockedByEthernet: false,
}

let wifiScan: ReturnType<typeof vi.fn>
let wifiConnect: ReturnType<typeof vi.fn>

beforeEach(() => {
  wifiScan = vi.fn(() => Promise.resolve(WIFI_ON))
  wifiConnect = vi.fn(() => Promise.resolve({ success: true }))
  ;(window as unknown as { shell: unknown }).shell = {
    network: {
      wifiScan,
      wifiConnect,
      wifiDisconnect: vi.fn(() => Promise.resolve({ success: true })),
    },
  }
})

function renderMenu(state: WifiState) {
  render(<WifiMenu state={state} onToggleRadio={() => {}} onBack={() => {}} darkText={false} />)
}

describe('WifiMenu', () => {
  it('offers the Wi-Fi toggle and the networks while nothing blocks Wi-Fi', () => {
    renderMenu(WIFI_ON)
    expect(document.querySelector('[aria-pressed]')).not.toBeNull()
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.queryByText(ETHERNET_ONLY_TITLE)).toBeNull()
  })

  it('shows only that Ethernet is connected while the firmware keeps Wi-Fi off for Ethernet', () => {
    renderMenu({ ...WIFI_ON, radio: 'off', networks: [], ethernet: true, blockedByEthernet: true })
    expect(document.querySelector('[aria-pressed]')).toBeNull()
    expect(screen.getByText(ETHERNET_ONLY_TITLE)).toBeTruthy()
    expect(screen.getByText('Wi-Fi')).toBeTruthy()
  })

  it('leaves out the refresh button and the networks while blocked', () => {
    renderMenu({ ...WIFI_ON, ethernet: true, blockedByEthernet: true })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText('Home')).toBeNull()
  })

  it('asks for enterprise credentials and offers Connect anyway when the server cannot be verified', async () => {
    const enterprise: WifiNetwork = { ...HOME, ssid: 'BBW_BMSW', security: 'enterprise', saved: false }
    wifiConnect
      .mockResolvedValueOnce({ success: false, needsPassword: true, needsUsername: true })
      .mockResolvedValueOnce({ success: false, error: 'untrusted-server' })
      .mockResolvedValueOnce({ success: true })

    renderMenu({ ...WIFI_ON, networks: [enterprise] })
    fireEvent.click(screen.getByText('BBW_BMSW'))

    const username = await screen.findByPlaceholderText('Username')
    const password = screen.getByPlaceholderText('Password')
    fireEvent.change(username, { target: { value: 'student@bbw.ch' } })
    fireEvent.change(password, { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    const connectAnyway = await screen.findByRole('button', { name: 'Connect anyway' })
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
    fireEvent.click(connectAnyway)

    expect(wifiConnect).toHaveBeenNthCalledWith(2, 'BBW_BMSW', 'secret', { username: 'student@bbw.ch', trustServer: false })
    expect(wifiConnect).toHaveBeenNthCalledWith(3, 'BBW_BMSW', 'secret', { username: 'student@bbw.ch', trustServer: true })
  })
})

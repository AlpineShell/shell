import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

beforeEach(() => {
  wifiScan = vi.fn(() => Promise.resolve(WIFI_ON))
  ;(window as unknown as { shell: unknown }).shell = {
    network: {
      wifiScan,
      wifiConnect: vi.fn(() => Promise.resolve({ success: true })),
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
})

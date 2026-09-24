import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ControlCenter from './controlCenter'

vi.mock('./wifiMenu', () => ({ default: () => null }))
vi.mock('./bluetoothMenu', () => ({ default: () => null }))

const BUILT_IN: MonitorInfo = { id: 'internal', name: 'Built-in display', type: 'internal', brightness: 60, brightnessWritable: true }
const DELL: MonitorInfo = { id: 'dell', name: 'DELL U2720Q', type: 'external', brightness: 40, brightnessWritable: true }

function renderControlCenter(monitors: MonitorInfo[]) {
  const setMonitorBrightness = vi.fn()
  render(
    <ControlCenter
      battery={{ percent: 80, charging: false, onAcPower: true, hasBattery: false }}
      network={{ signal: null, connected: false, type: 'wifi', ssid: null }}
      bluetooth={{ radio: { state: 'off', pending: null, error: null }, devices: [], devicesAvailable: false }}
      volume={50}
      setVolume={() => {}}
      muted={false}
      toggleMute={() => {}}
      monitors={monitors}
      setMonitorBrightness={setMonitorBrightness}
      wifiNetworks={[]}
      wifiScanning={false}
      scanWifi={() => {}}
      wifiRadio={false}
      onToggleWifiRadio={() => {}}
    />,
  )
  return { setMonitorBrightness }
}

describe('brightness in the control center', () => {
  it('shows one brightness slider for a single display', () => {
    renderControlCenter([BUILT_IN])
    expect(screen.getByRole('slider', { name: 'Brightness' })).toBeTruthy()
    expect(screen.queryByText('Brightness')).toBeNull()
  })

  it('groups two displays behind one Brightness entry instead of two unnamed sliders', () => {
    renderControlCenter([BUILT_IN, DELL])
    expect(screen.queryByRole('slider', { name: 'Brightness' })).toBeNull()
    expect(screen.getAllByRole('slider')).toHaveLength(1)
    expect(screen.getByText('Brightness')).toBeTruthy()
  })

  it('lists every display by name inside the Brightness entry', () => {
    renderControlCenter([BUILT_IN, DELL])
    fireEvent.click(screen.getByText('Brightness'))
    expect(screen.getByRole('slider', { name: 'Built-in display' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'DELL U2720Q' })).toBeTruthy()
  })

  it('changes only the display whose slider moves', () => {
    const { setMonitorBrightness } = renderControlCenter([BUILT_IN, DELL])
    fireEvent.click(screen.getByText('Brightness'))
    fireEvent.change(screen.getByRole('slider', { name: 'DELL U2720Q' }), { target: { value: '30' } })
    expect(setMonitorBrightness).toHaveBeenCalledWith('dell', 30)
    expect(setMonitorBrightness).toHaveBeenCalledTimes(1)
  })

  it('marks a display that does not respond', () => {
    renderControlCenter([BUILT_IN, { ...DELL, brightnessWritable: false }])
    fireEvent.click(screen.getByText('Brightness'))
    expect(screen.getByRole('slider', { name: 'DELL U2720Q (not responding)' })).toBeTruthy()
  })
})

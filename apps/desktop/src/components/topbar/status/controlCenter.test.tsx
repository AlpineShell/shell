import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ControlCenter from './controlCenter'

vi.mock('./wifiMenu', () => ({ default: () => null }))
vi.mock('./bluetoothMenu', () => ({ default: () => null }))

const SPEAKERS: AudioDevice = { id: '{0.0.0.00000000}.{speakers}', name: 'Speakers (Realtek)', isDefault: true }
const HEADPHONES: AudioDevice = { id: '{0.0.0.00000000}.{headphones}', name: 'Headphones (AirPods Pro)', isDefault: false }
const MICROPHONE: AudioDevice = { id: '{0.0.1.00000000}.{microphone}', name: 'Microphone Array', isDefault: true }

const audio = vi.hoisted(() => ({
  devices: { output: [] as AudioDevice[], input: [] as AudioDevice[] },
  setDefault: vi.fn<(id: string) => void>(),
  shownInStatus: false,
}))

vi.mock('../../../hooks/useStatusSound', () => ({ useStatusSound: () => audio.shownInStatus }))

vi.mock('../../../hooks/useAudioDevices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useAudioDevices')>()),
  useAudioDevices: () => ({ devices: audio.devices, loaded: true, setDefault: audio.setDefault }),
}))

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

describe('sound in the control center', () => {
  function withAudioDevices(output: AudioDevice[], input: AudioDevice[]) {
    audio.shownInStatus = true
    audio.devices = { output, input }
    audio.setDefault = vi.fn()
    return audio.setDefault
  }

  it('leaves the Sound row out until it is turned on in the Ridge settings', () => {
    withAudioDevices([SPEAKERS, HEADPHONES], [MICROPHONE])
    audio.shownInStatus = false
    renderControlCenter([BUILT_IN])
    expect(screen.queryByText('Sound')).toBeNull()
    expect(screen.queryByText('Speakers (Realtek)')).toBeNull()
  })

  it('names the output Windows is playing through', () => {
    withAudioDevices([SPEAKERS, HEADPHONES], [MICROPHONE])
    renderControlCenter([BUILT_IN])
    expect(screen.getByText('Sound')).toBeTruthy()
    expect(screen.getByText('Speakers (Realtek)')).toBeTruthy()
  })

  it('lists every output and input with the default checked', () => {
    withAudioDevices([SPEAKERS, HEADPHONES], [MICROPHONE])
    renderControlCenter([BUILT_IN])
    fireEvent.click(screen.getByText('Sound'))
    expect(screen.getByRole('menuitemradio', { name: 'Speakers (Realtek)' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: 'Headphones (AirPods Pro)' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('menuitemradio', { name: 'Microphone Array' }).getAttribute('aria-checked')).toBe('true')
  })

  it('switches to the device that is picked', () => {
    const setDefault = withAudioDevices([SPEAKERS, HEADPHONES], [MICROPHONE])
    renderControlCenter([BUILT_IN])
    fireEvent.click(screen.getByText('Sound'))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Headphones (AirPods Pro)' }))
    expect(setDefault).toHaveBeenCalledWith(HEADPHONES.id)
  })

  it('does not switch again to the device already in use', () => {
    const setDefault = withAudioDevices([SPEAKERS, HEADPHONES], [MICROPHONE])
    renderControlCenter([BUILT_IN])
    fireEvent.click(screen.getByText('Sound'))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Speakers (Realtek)' }))
    expect(setDefault).not.toHaveBeenCalled()
  })

  it('says when no microphone is connected', () => {
    withAudioDevices([SPEAKERS], [])
    renderControlCenter([BUILT_IN])
    fireEvent.click(screen.getByText('Sound'))
    expect(screen.getByRole('group', { name: 'Input' }).textContent).toContain('None connected')
  })
})

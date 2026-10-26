import { describe, it, expect } from 'vitest'
import audioDevices from './audioDevices.js'

const { NO_AUDIO_DEVICES, isEndpointId, parseAudioDevices, findAudioDevice, withDefaultDevice } = audioDevices

const SPEAKERS = '{0.0.0.00000000}.{d3ac2b73-0d5c-4882-aeac-51fdafd224c2}'
const HEADPHONES = '{0.0.0.00000000}.{bdd5bb5d-2e6b-4fd1-99ec-dd7f4163b52d}'
const MICROPHONE = '{0.0.1.00000000}.{1becf4b4-1e6d-46e8-9cfc-e7966e624db2}'

function endpoint(Id, Name, Flow, IsDefault = false) {
  return { Id, Name, Flow, IsDefault }
}

describe('isEndpointId', () => {
  it('accepts the ids Windows gives audio endpoints', () => {
    expect(isEndpointId(SPEAKERS)).toBe(true)
    expect(isEndpointId(MICROPHONE)).toBe(true)
  })

  it('refuses anything that could break out of a PowerShell string', () => {
    expect(isEndpointId("{0.0.0.00000000}.{abc}'; Stop-Computer; '")).toBe(false)
    expect(isEndpointId('')).toBe(false)
    expect(isEndpointId(42)).toBe(false)
    expect(isEndpointId(null)).toBe(false)
  })
})

describe('parseAudioDevices', () => {
  it('splits outputs from inputs and sorts each by name', () => {
    const raw = JSON.stringify([
      endpoint(SPEAKERS, 'Speakers (Realtek)', 'output'),
      endpoint(HEADPHONES, 'Headphones (AirPods Pro)', 'output', true),
      endpoint(MICROPHONE, 'Microphone Array', 'input', true),
    ])
    expect(parseAudioDevices(raw)).toEqual({
      output: [
        { id: HEADPHONES, name: 'Headphones (AirPods Pro)', isDefault: true },
        { id: SPEAKERS, name: 'Speakers (Realtek)', isDefault: false },
      ],
      input: [{ id: MICROPHONE, name: 'Microphone Array', isDefault: true }],
    })
  })

  it('reads a lone endpoint that PowerShell did not wrap in an array', () => {
    const raw = JSON.stringify(endpoint(SPEAKERS, 'Speakers', 'output', true))
    expect(parseAudioDevices(raw).output).toEqual([{ id: SPEAKERS, name: 'Speakers', isDefault: true }])
  })

  it('names a device that has no friendly name', () => {
    const raw = JSON.stringify([endpoint(SPEAKERS, null, 'output')])
    expect(parseAudioDevices(raw).output[0].name).toBe('Unknown device')
  })

  it('drops endpoints whose id is not an endpoint id', () => {
    const raw = JSON.stringify([endpoint('not-an-id', 'Speakers', 'output')])
    expect(parseAudioDevices(raw)).toEqual(NO_AUDIO_DEVICES)
  })

  it('returns no devices for output that is not JSON', () => {
    expect(parseAudioDevices('')).toEqual(NO_AUDIO_DEVICES)
    expect(parseAudioDevices('Exception calling "List"')).toEqual(NO_AUDIO_DEVICES)
  })
})

describe('findAudioDevice', () => {
  const devices = parseAudioDevices(
    JSON.stringify([endpoint(SPEAKERS, 'Speakers', 'output', true), endpoint(MICROPHONE, 'Microphone', 'input', true)])
  )

  it('finds an output or an input by id', () => {
    expect(findAudioDevice(devices, SPEAKERS)?.name).toBe('Speakers')
    expect(findAudioDevice(devices, MICROPHONE)?.name).toBe('Microphone')
  })

  it('finds nothing for an id that is not connected', () => {
    expect(findAudioDevice(devices, HEADPHONES)).toBeNull()
  })
})

describe('withDefaultDevice', () => {
  const devices = parseAudioDevices(
    JSON.stringify([
      endpoint(SPEAKERS, 'Speakers', 'output', true),
      endpoint(HEADPHONES, 'Headphones', 'output'),
      endpoint(MICROPHONE, 'Microphone', 'input', true),
    ])
  )

  it('moves the default within the chosen device’s own list and leaves the other alone', () => {
    const next = withDefaultDevice(devices, HEADPHONES)
    expect(next.output.find((device) => device.isDefault)?.id).toBe(HEADPHONES)
    expect(next.output.filter((device) => device.isDefault)).toHaveLength(1)
    expect(next.input).toEqual(devices.input)
  })
})

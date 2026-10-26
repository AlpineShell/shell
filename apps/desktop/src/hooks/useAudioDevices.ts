import { useEffect, useState } from 'react'

const NO_AUDIO_DEVICES: AudioDevices = { output: [], input: [] }

function flowOf(devices: AudioDevices, id: string): AudioDeviceFlow | null {
  if (devices.output.some((device) => device.id === id)) return 'output'
  if (devices.input.some((device) => device.id === id)) return 'input'
  return null
}

function withDefault(devices: AudioDevices, id: string): AudioDevices {
  const flow = flowOf(devices, id)
  if (!flow) return devices
  return { ...devices, [flow]: devices[flow].map((device) => ({ ...device, isDefault: device.id === id })) }
}

export function defaultAudioDevice(devices: AudioDevice[]): AudioDevice | null {
  return devices.find((device) => device.isDefault) ?? null
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevices>(NO_AUDIO_DEVICES)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    const apply = (next: AudioDevices) => {
      if (!alive) return
      setDevices(next)
      setLoaded(true)
    }
    window.shell.system.audioDevices().then(apply).catch(() => {})
    const unsubscribe = window.shell.system.onAudioDevicesChanged(apply)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const setDefault = (id: string) => {
    setDevices((current) => withDefault(current, id))
    window.shell.system
      .setAudioDevice(id)
      .then((result) => setDevices(result.devices))
      .catch(() => {})
  }

  return { devices, loaded, setDefault }
}

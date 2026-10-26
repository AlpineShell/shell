import { Row, Select } from '@alpine/ui'
import { defaultAudioDevice, useAudioDevices } from '../../hooks/useAudioDevices'
import RegistryPage from './registryPage'

const DEVICES_GROUP = 'Devices'

export default function SoundPage() {
  const { devices, loaded, setDefault } = useAudioDevices()

  const slots: SettingsPageSlot[] = [
    {
      group: DEVICES_GROUP,
      order: 0,
      replaces: ['audio-output'],
      content: <AudioDeviceRow label="Output" devices={devices.output} loaded={loaded} onChange={setDefault} />,
    },
    {
      group: DEVICES_GROUP,
      order: 1,
      replaces: ['audio-input'],
      content: <AudioDeviceRow label="Input" devices={devices.input} loaded={loaded} onChange={setDefault} />,
    },
  ]

  return <RegistryPage page="sound" slots={slots} />
}

function AudioDeviceRow({
  label,
  devices,
  loaded,
  onChange,
}: {
  label: string
  devices: AudioDevice[]
  loaded: boolean
  onChange: (id: string) => void
}) {
  const selected = defaultAudioDevice(devices)

  if (devices.length === 0) {
    return (
      <Row label={label}>
        <span className="text-sm text-ink-quiet">{loaded ? 'None connected' : ''}</span>
      </Row>
    )
  }

  const options = devices.map((device) => ({ value: device.id, label: device.name }))
  return (
    <Row label={label}>
      <Select variant="filled" label={label} options={options} value={selected?.id ?? ''} onChange={onChange} />
    </Row>
  )
}

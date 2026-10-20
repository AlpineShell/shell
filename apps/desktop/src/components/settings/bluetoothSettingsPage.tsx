import { useState } from 'react'
import {
  Bluetooth,
  BluetoothConnected,
  Gamepad2,
  Headphones,
  Keyboard,
  Laptop,
  Mic,
  Mouse,
  Plus,
  RefreshCw,
  Smartphone,
  Speaker,
  Watch,
  type LucideIcon,
} from 'lucide-react'
import { Button, Card, ConfirmButton, EmptyState, ListRow, PageHeader, Row, Section, Spinner, Toggle } from '@alpine/ui'
import { useBluetooth } from '../../hooks/useBluetooth'
import { useBluetoothRescan } from '../../hooks/useBluetoothRescan'
import { settingsPage } from '../../settings/registry'
import PageSpinner from './pageSpinner'
import {
  CHECKING_BLUETOOTH,
  canToggleRadio,
  deviceStatusLabel,
  displayedRadioOn,
  nextDeviceAction,
  radioEmptyStateTitle,
  radioErrorLabel,
} from '../../lib/bluetoothPresentation'

export default function BluetoothSettingsPage() {
  const { state, toggleDevice, setRadio, openPairing, removeDevice, repairAudio } = useBluetooth()
  const { refreshing, rescan } = useBluetoothRescan()
  const [openId, setOpenId] = useState<string | null>(null)
  const radioOn = displayedRadioOn(state)
  const notice = radioEmptyStateTitle(state)
  const radioError = radioErrorLabel(state.radio.error)

  return (
    <div className="flex w-full flex-col gap-section">
      <PageHeader variant="plain" title={settingsPage('bluetooth')?.label ?? ''}>
        {radioOn && (
          <>
            <Button shape="square" variant="ghost" size="sm" icon={<RefreshCw size={14} />} busy={refreshing} onClick={rescan}>
              Rescan
            </Button>
            <Button shape="square" variant="soft" size="sm" icon={<Plus size={14} />} onClick={() => openPairing()}>
              Pair new device
            </Button>
          </>
        )}
      </PageHeader>

      <Card variant="group">
        <Row label="Bluetooth" description={radioError ? <span className="text-danger">{radioError}</span> : undefined}>
          <Toggle
            variant="compact"
            label="Bluetooth"
            checked={radioOn}
            pending={state.radio.pending !== null}
            disabled={!canToggleRadio(state)}
            onChange={(on) => setRadio(on)}
          />
        </Row>
      </Card>

      {notice === CHECKING_BLUETOOTH || (refreshing && state.devices.length === 0) ? (
        <PageSpinner label={CHECKING_BLUETOOTH} />
      ) : notice ? (
        <EmptyState variant="plain" title={notice} />
      ) : (
        <Section variant="label" title="Devices">
          <Card variant="list">
            {state.devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                open={openId === device.id}
                onOpen={() => setOpenId(openId === device.id ? null : device.id)}
                onToggle={() => toggleDevice(device)}
                onRemove={() => removeDevice(device)}
                onRepair={() => repairAudio(device)}
              />
            ))}
          </Card>
        </Section>
      )}
    </div>
  )
}

const DEVICE_ICONS: Record<BluetoothDeviceKind, LucideIcon> = {
  headphones: Headphones,
  speaker: Speaker,
  microphone: Mic,
  mouse: Mouse,
  keyboard: Keyboard,
  gamepad: Gamepad2,
  phone: Smartphone,
  computer: Laptop,
  watch: Watch,
  other: Bluetooth,
}

const DEVICE_ICON_SIZE = 17

function DeviceIcon({ device }: { device: BluetoothDevice }) {
  if (device.pending) return <Spinner size={16} />
  const tone = device.connected ? 'text-ink-primary' : 'text-ink-quiet'
  if (device.kind === 'other' && device.connected) return <BluetoothConnected size={DEVICE_ICON_SIZE} className={tone} />
  const Icon = DEVICE_ICONS[device.kind] ?? Bluetooth
  return <Icon size={DEVICE_ICON_SIZE} strokeWidth={1.75} className={tone} />
}

function DeviceActions({ device, onToggle, onRemove, onRepair }: { device: BluetoothDevice; onToggle: () => void; onRemove: () => void; onRepair: () => void }) {
  const action = nextDeviceAction(device)
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 pr-3.5 pb-3 pl-[54px]">
      {action && (
        <Button shape="square" variant={action === 'connect' ? 'primary' : 'soft'} size="sm" onClick={onToggle}>
          {action === 'connect' ? 'Connect' : 'Disconnect'}
        </Button>
      )}
      {device.audioDisabled && (
        <Button shape="square" variant="soft" size="sm" onClick={onRepair}>
          Turn audio back on
        </Button>
      )}
      <ConfirmButton
        shape="square"
        label="Remove device"
        confirmLabel="Forget device"
        variant="dangerSoft"
        confirmVariant="danger"
        size="sm"
        onConfirm={onRemove}
      />
    </div>
  )
}

function DeviceRow({
  device,
  open,
  onOpen,
  onToggle,
  onRemove,
  onRepair,
}: {
  device: BluetoothDevice
  open: boolean
  onOpen: () => void
  onToggle: () => void
  onRemove: () => void
  onRepair: () => void
}) {
  const expanded = open && device.pending === null
  return (
    <ListRow
      variant="plain"
      icon={<DeviceIcon device={device} />}
      title={device.name}
      detail={<span className={device.error ? 'text-danger' : ''}>{deviceStatusLabel(device)}</span>}
      onActivate={onOpen}
      activateLabel={device.name}
      expanded={expanded}
      disabled={device.pending !== null}
    >
      {expanded && <DeviceActions device={device} onToggle={onToggle} onRemove={onRemove} onRepair={onRepair} />}
    </ListRow>
  )
}

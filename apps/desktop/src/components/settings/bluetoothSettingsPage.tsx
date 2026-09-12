import { Bluetooth, BluetoothConnected, Plus, RefreshCw, Unlink, Wrench } from 'lucide-react'
import EmptyState from '../ui/emptyState'
import IconButton from '../ui/iconButton'
import ListRow from '../ui/listRow'
import PageHeader from '../ui/pageHeader'
import Spinner from '../ui/spinner'
import Toggle from '../ui/toggle'
import { useBluetooth } from '../../hooks/useBluetooth'
import { useBluetoothRescan } from '../../hooks/useBluetoothRescan'
import {
  canToggleRadio,
  deviceActionLabel,
  deviceStatusLabel,
  displayedRadioOn,
  nextDeviceAction,
  radioEmptyStateTitle,
  radioErrorLabel,
} from '../../lib/bluetoothPresentation'

export default function BluetoothSettingsPage() {
  const { state, toggleDevice, setRadio, openPairing, removeDevice, repairAudio } = useBluetooth()
  const { refreshing, rescan } = useBluetoothRescan()
  const radioOn = displayedRadioOn(state)
  const notice = radioEmptyStateTitle(state)
  const radioError = radioErrorLabel(state.radio.error)

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title="Bluetooth">
        <IconButton onClick={() => openPairing()} disabled={!radioOn} label="Pair new device">
          <Plus size={16} />
        </IconButton>
        <IconButton onClick={rescan} busy={refreshing} disabled={!radioOn} label="Rescan">
          <RefreshCw size={15} />
        </IconButton>
        <Toggle
          label="Bluetooth"
          checked={radioOn}
          pending={state.radio.pending !== null}
          disabled={!canToggleRadio(state)}
          onChange={(on) => setRadio(on)}
        />
      </PageHeader>

      {radioError && <p className="-mt-3 text-xs text-danger">{radioError}</p>}

      {notice ? (
        <EmptyState icon={<Bluetooth size={20} />} title={notice} />
      ) : (
        <div className="flex flex-col gap-1">
          {state.devices.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              onToggle={() => toggleDevice(device)}
              onRemove={() => removeDevice(device)}
              onRepair={() => repairAudio(device)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DeviceIcon({ device }: { device: BluetoothDevice }) {
  if (device.pending) return <Spinner size={16} />
  if (device.connected) return <BluetoothConnected size={16} className="text-ink-primary" />
  return <Bluetooth size={16} className="text-ink-quiet" />
}

function DeviceActions({ device, onRemove, onRepair }: { device: BluetoothDevice; onRemove: () => void; onRepair: () => void }) {
  if (device.pending) return null
  return (
    <>
      {device.audioDisabled && (
        <IconButton label="Turn audio back on" onClick={onRepair}>
          <Wrench size={14} />
        </IconButton>
      )}
      <IconButton
        label="Remove device"
        variant="danger"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Unlink size={14} />
      </IconButton>
    </>
  )
}

function DeviceRow({ device, onToggle, onRemove, onRepair }: { device: BluetoothDevice; onToggle: () => void; onRemove: () => void; onRepair: () => void }) {
  const actionable = nextDeviceAction(device) !== null
  return (
    <ListRow
      icon={<DeviceIcon device={device} />}
      title={device.name}
      detail={<span className={device.error ? 'text-danger' : ''}>{deviceStatusLabel(device)}</span>}
      onActivate={actionable ? onToggle : undefined}
      activateLabel={deviceActionLabel(device)}
      disabled={device.pending !== null}
      actions={<DeviceActions device={device} onRemove={onRemove} onRepair={onRepair} />}
    />
  )
}

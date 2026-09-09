import { useEffect, useState } from 'react'
import { Bluetooth, BluetoothConnected, Plus, RefreshCw, Unlink } from 'lucide-react'
import EmptyState from '../ui/emptyState'
import IconButton from '../ui/iconButton'
import ListRow from '../ui/listRow'
import PageHeader from '../ui/pageHeader'
import Spinner from '../ui/spinner'
import Toggle from '../ui/toggle'

function deviceStatus(device: BluetoothDevice, busy: boolean, removing: boolean, removeFailed: boolean): string {
  if (removeFailed) return 'Failed to remove'
  if (removing) return 'Removing…'
  if (busy) return device.connected ? 'Disconnecting…' : 'Connecting…'
  if (device.connected) return 'Connected'
  return device.paired ? 'Paired' : 'Available'
}

export default function BluetoothSettingsPage() {
  const [enabled, setEnabled] = useState(window.alpineBoot?.bluetooth()?.enabled ?? false)
  const [devices, setDevices] = useState<BluetoothDevice[]>([])
  const [scanning, setScanning] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeErrorId, setRemoveErrorId] = useState<string | null>(null)

  useEffect(() => {
    window.shell.system.bluetoothDevices().then((cached) => {
      if (cached.length > 0) setDevices(cached)
    })
    window.shell.system.bluetooth().then((s) => setEnabled(s.enabled))
    window.shell.system.onBluetoothChanged((s) => setEnabled(s.enabled))
    window.shell.system.onBluetoothDevicesChanged(setDevices)
    scan()
  }, [])

  function scan() {
    setScanning(true)
    window.shell.system.bluetoothScan().then((list) => {
      setDevices(list)
      setScanning(false)
    })
  }

  async function toggleRadio(value: boolean) {
    setEnabled(value)
    if (!value) setDevices([])
    else setScanning(true)
    const result = await window.shell.system.bluetoothSetRadio(value)
    if (result.success && value) {
      setTimeout(() => {
        window.shell.system.bluetoothScan().then((list) => {
          setDevices(list)
          setScanning(false)
        })
      }, 1500)
    }
  }

  async function toggleDevice(device: BluetoothDevice) {
    if (togglingId) return
    setTogglingId(device.instanceId)
    await window.shell.system.bluetoothToggle(device.instanceId, device.connected ? 'disconnect' : 'connect')
    setTimeout(() => setTogglingId(null), 2000)
  }

  async function removeDevice(device: BluetoothDevice) {
    if (removingId) return
    setRemovingId(device.instanceId)
    setRemoveErrorId(null)
    const result = await window.shell.system.bluetoothUnpair(device.instanceId)
    setRemovingId(null)
    if (result.success) {
      setDevices((prev) => prev.filter((d) => d.instanceId !== device.instanceId))
    } else {
      setRemoveErrorId(device.instanceId)
      setTimeout(() => setRemoveErrorId((id) => (id === device.instanceId ? null : id)), 2500)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title="Bluetooth">
        <IconButton
          onClick={() => window.shell.system.bluetoothOpenSettings()}
          disabled={!enabled}
          label="Pair new device"
        >
          <Plus size={16} />
        </IconButton>
        <IconButton onClick={scan} disabled={scanning || !enabled} label="Rescan">
          <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
        </IconButton>
        <Toggle label="Bluetooth" checked={enabled} onChange={toggleRadio} />
      </PageHeader>

      {!enabled ? (
        <EmptyState icon={<Bluetooth size={20} />} title="Bluetooth off" />
      ) : scanning && devices.length === 0 ? (
        <EmptyState icon={<Spinner size={20} />} title="Searching…" />
      ) : devices.length === 0 ? (
        <EmptyState icon={<Bluetooth size={20} />} title="No devices" />
      ) : (
        <div className="flex flex-col gap-1">
          {devices.map((d) => (
            <DeviceRow
              key={d.instanceId}
              device={d}
              busy={togglingId === d.instanceId}
              removing={removingId === d.instanceId}
              removeFailed={removeErrorId === d.instanceId}
              onClick={() => toggleDevice(d)}
              onRemove={() => removeDevice(d)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DeviceRow({ device, busy, removing, removeFailed, onClick, onRemove }: { device: BluetoothDevice; busy: boolean; removing: boolean; removeFailed: boolean; onClick: () => void; onRemove: () => void }) {
  return (
    <ListRow
      icon={
        device.connected ? (
          <BluetoothConnected size={16} className="text-ink-primary" />
        ) : (
          <Bluetooth size={16} className="text-ink-quiet" />
        )
      }
      title={device.name}
      detail={
        <span className={removeFailed ? 'text-danger' : ''}>{deviceStatus(device, busy, removing, removeFailed)}</span>
      }
      onActivate={onClick}
      disabled={busy || removing}
      activateLabel={device.connected ? `Disconnect ${device.name}` : `Connect ${device.name}`}
      actions={
        busy || removing ? (
          <Spinner size={14} />
        ) : device.paired ? (
          <IconButton
            label="Remove device"
            variant="danger"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Unlink size={14} />
          </IconButton>
        ) : null
      }
    />
  )
}

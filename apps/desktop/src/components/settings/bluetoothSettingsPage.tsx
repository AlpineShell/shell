import { useEffect, useState } from 'react'
import { Bluetooth, BluetoothConnected, Loader2, Plus, RefreshCw, Unlink } from 'lucide-react'
import PageTitle from '../ui/pageTitle'
import Toggle from '../ui/toggle'
import IconButton from '../ui/iconButton'

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
    <div className="w-full flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <PageTitle title="Bluetooth" />
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {!enabled ? (
        <EmptyState icon={<Bluetooth size={20} />} text="Bluetooth off" />
      ) : scanning && devices.length === 0 ? (
        <EmptyState icon={<Loader2 size={20} className="animate-spin" />} text="Searching..." />
      ) : devices.length === 0 ? (
        <EmptyState icon={<Bluetooth size={20} />} text="No devices" />
      ) : (
        <div className="flex flex-col">
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
    <div className="group relative after:content-[''] after:absolute after:bottom-0 after:left-2 after:right-2 after:h-px after:bg-line-hairline last:after:hidden hover:after:hidden [&:has(+*:hover)]:after:hidden">
      <button
        onClick={onClick}
        disabled={busy || removing}
        className="focus-ring w-full flex items-center justify-between gap-4 py-3 px-2 rounded-field cursor-pointer hover:bg-fill-ghost transition-colors text-left disabled:cursor-default"
      >
        <div className="flex items-center gap-3 min-w-0">
          {device.connected ? (
            <BluetoothConnected size={16} className="text-ink-primary shrink-0" />
          ) : (
            <Bluetooth size={16} className="text-ink-quiet shrink-0" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm text-ink-primary truncate">{device.name}</span>
            <span className={`text-xs ${removeFailed ? 'text-danger' : 'text-ink-quiet'}`}>
              {removeFailed ? 'Failed to remove' : removing ? 'Removing...' : busy ? (device.connected ? 'Disconnecting...' : 'Connecting...') : device.connected ? 'Connected' : device.paired ? 'Paired' : 'Available'}
            </span>
          </div>
        </div>
      </button>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
        {busy || removing ? (
          <Loader2 size={14} className="text-ink-secondary animate-spin" />
        ) : device.paired ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="focus-ring pointer-events-auto flex items-center justify-center text-ink-quiet hover:text-danger cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
            aria-label="Remove device"
            title="Remove device"
          >
            <Unlink size={14} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-ink-faint">
      {icon}
      <span className="text-sm">{text}</span>
    </div>
  )
}

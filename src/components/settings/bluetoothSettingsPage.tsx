import { useEffect, useState } from 'react'
import { Bluetooth, BluetoothConnected, Loader2, Plus, RefreshCw } from 'lucide-react'

export default function BluetoothSettingsPage() {
  const [enabled, setEnabled] = useState(window.alpineBoot?.bluetooth?.enabled ?? false)
  const [devices, setDevices] = useState<BluetoothDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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

  return (
    <div className="w-full flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Bluetooth</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.shell.system.bluetoothOpenSettings()}
            disabled={!enabled}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white/5 hover:bg-white/10 text-white/90"
          >
            <Plus size={13} />
            Pair new device
          </button>
          <button
            onClick={scan}
            disabled={scanning || !enabled}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white/80 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Rescan"
          >
            <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
          </button>
          <Toggle checked={enabled} onChange={toggleRadio} />
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
              onClick={() => toggleDevice(d)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DeviceRow({ device, busy, onClick }: { device: BluetoothDevice; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center justify-between gap-4 py-3 px-1 border-b border-white/5 last:border-b-0 cursor-pointer hover:bg-white/3 transition-colors text-left disabled:cursor-default"
    >
      <div className="flex items-center gap-3 min-w-0">
        {device.connected ? (
          <BluetoothConnected size={16} className="text-white shrink-0" />
        ) : (
          <Bluetooth size={16} className="text-white/50 shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-white/90 truncate">{device.name}</span>
          <span className="text-xs text-white/50">
            {busy ? (device.connected ? 'Disconnecting...' : 'Connecting...') : device.connected ? 'Connected' : device.paired ? 'Paired' : 'Available'}
          </span>
        </div>
      </div>
      {busy && <Loader2 size={14} className="text-white/60 animate-spin shrink-0" />}
    </button>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/40">
      {icon}
      <span className="text-sm">{text}</span>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 cursor-pointer rounded-full transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}
      style={{ width: 36, height: 20 }}
    >
      <span
        className="absolute top-0.5 rounded-full transition-all"
        style={{
          width: 16,
          height: 16,
          left: checked ? 18 : 2,
          backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)',
        }}
      />
    </button>
  )
}

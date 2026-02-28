import { Bluetooth, BluetoothConnected, BluetoothOff, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from 'lucide-react'
import { useWifiSignal } from '../../hooks/useWifiSignal'
import { useBluetooth } from '../../hooks/useBluetooth'

function WifiIcon({ size }: { size: number }) {
    const { signal, connected } = useWifiSignal()

    if (!connected) return <WifiOff size={size} />
    if (signal === null) return <Wifi size={size} />
    if (signal === 0) return <WifiZero size={size} />
    if (signal <= 33) return <WifiLow size={size} />
    if (signal <= 66) return <Wifi size={size} />
    return <WifiHigh size={size} />
}

function BluetoothIcon({ size }: { size: number }) {
    const { enabled, connected } = useBluetooth()

    if (!enabled) return <BluetoothOff size={size} />
    if (connected) return <BluetoothConnected size={size} />
    return <Bluetooth size={size} />
}

export default function QuickSettings() {
    return (
        <div className="flex justify-center gap-2 items-center bg-systemBg rounded-full py-2 px-5 w-fit">
            <WifiIcon size={20} />
            <BluetoothIcon size={20} />
        </div>
    )
}

import { Bluetooth, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from 'lucide-react'
import { useWifiSignal } from '../../hooks/useWifiSignal'

function WifiIcon({ size }: { size: number }) {
    const { signal, connected } = useWifiSignal()

    if (!connected) return <WifiOff size={size} />
    if (signal === null || signal === 0) return <WifiZero size={size} />
    if (signal <= 33) return <WifiLow size={size} />
    if (signal <= 66) return <Wifi size={size} />
    return <WifiHigh size={size} />
}

export default function QuickSettings() {
    return (
        <div className="flex justify-center gap-2 items-center bg-systemBg rounded-full py-2 px-5 w-fit">
            <WifiIcon size={20} />
            <Bluetooth size={20} />
        </div>
    )
}

import { Bluetooth, BluetoothOff, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react";
import { useBluetooth } from "../hooks/useBluetooth";
import { useWifiSignal } from "../hooks/useWifiSignal";

function WifiIcon() {
    const { signal, connected } = useWifiSignal();

    if (!connected) return <WifiOff color="white" size={14} />;
    if (signal === null) return <Wifi color="white" size={14} />;
    if (signal >= 70) return <Wifi color="white" size={14} />;
    if (signal >= 40) return <WifiHigh color="white" size={14} />;
    if (signal >= 10) return <WifiLow color="white" size={14} />;
    return <WifiZero color="white" size={14} />;
}

function BluetoothIcon() {
    const { enabled } = useBluetooth();

    if (!enabled) return <BluetoothOff color="white" size={14} />;
    return <Bluetooth color="white" size={14} />;
}

export default function StatusIndicator() {
    return (
        <div className="bg-white/10 flex px-2 rounded-full py-0.5 items-center gap-1">
            <BluetoothIcon />
            <WifiIcon />
        </div>
    );
}

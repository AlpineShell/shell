import { Bluetooth, BluetoothConnected, BluetoothOff, EthernetPort, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react";
import { useBluetooth } from "../hooks/useBluetooth";
import { useMonitors } from "../hooks/useMonitors";
import { useVolume } from "../hooks/useVolume";
import { useNetworkStatus } from "../hooks/useNetwork";
import ControlCenter from "./controlCenter";
import PopupMenu from "./popupMenu";

function NetworkIcon({ signal, connected, type }: { signal: number | null; connected: boolean; type: string }) {
    if (type === 'ethernet') {
        return <EthernetPort color="white" size={14} />;
    }

    if (!connected) return <WifiOff color="white" size={14} />;
    if (signal === null) return <Wifi color="white" size={14} />;
    if (signal >= 70) return <Wifi color="white" size={14} />;
    if (signal >= 40) return <WifiHigh color="white" size={14} />;
    if (signal >= 10) return <WifiLow color="white" size={14} />;
    return <WifiZero color="white" size={14} />;
}

function BluetoothIcon({ enabled, connected }: { enabled: boolean; connected: boolean }) {
    if (!enabled) return <BluetoothOff color="white" size={14} />;
    if (connected) return <BluetoothConnected color="white" size={14} />;
    return <Bluetooth color="white" size={14} />;
}

export default function StatusIndicator() {
    const network = useNetworkStatus();
    const bluetooth = useBluetooth();
    const { volume, setVolume, muted, toggleMute } = useVolume();
    const { monitors, setBrightness: setMonitorBrightness } = useMonitors();

    return (
        <PopupMenu
            align="right"
            trigger={
                <div className="bg-white/10 flex px-2 rounded-full py-0.5 items-center gap-1">
                    <BluetoothIcon enabled={bluetooth.enabled} connected={bluetooth.connected} />
                    <NetworkIcon signal={network.signal} connected={network.connected} type={network.type} />
                </div>
            }
        >
            <ControlCenter network={network} bluetooth={bluetooth} volume={volume} setVolume={setVolume} muted={muted} toggleMute={toggleMute} monitors={monitors} setMonitorBrightness={setMonitorBrightness} />
        </PopupMenu>
    );
}

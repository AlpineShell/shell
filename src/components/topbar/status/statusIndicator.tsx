import { Bluetooth, BluetoothConnected, BluetoothOff, EthernetPort, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react";
import { useBluetooth } from "../../../hooks/useBluetooth";
import { useMonitors } from "../../../hooks/useMonitors";
import { useVolume } from "../../../hooks/useVolume";
import { useNetworkStatus } from "../../../hooks/useNetwork";
import ControlCenter from "./controlCenter";
import PopupMenu from "../shared/popupMenu";
import { useDarkText } from "../../themeContext";

function NetworkIcon({ signal, connected, type, color }: { signal: number | null; connected: boolean; type: string; color: string }) {
    if (type === 'ethernet') {
        return <EthernetPort color={color} size={14} />;
    }

    if (!connected) return <WifiOff color={color} size={14} />;
    if (signal === null) return <Wifi color={color} size={14} />;
    if (signal >= 70) return <Wifi color={color} size={14} />;
    if (signal >= 40) return <WifiHigh color={color} size={14} />;
    if (signal >= 10) return <WifiLow color={color} size={14} />;
    return <WifiZero color={color} size={14} />;
}

function BluetoothIcon({ enabled, connected, color }: { enabled: boolean; connected: boolean; color: string }) {
    if (!enabled) return <BluetoothOff color={color} size={14} />;
    if (connected) return <BluetoothConnected color={color} size={14} />;
    return <Bluetooth color={color} size={14} />;
}

export default function StatusIndicator() {
    const darkText = useDarkText();
    const network = useNetworkStatus();
    const bluetooth = useBluetooth();
    const { volume, setVolume, muted, toggleMute } = useVolume();
    const { monitors, setBrightness: setMonitorBrightness } = useMonitors();
    const iconColor = darkText ? "black" : "white";

    return (
        <PopupMenu
            align="right"
            trigger={
                <div className={`${darkText ? "bg-black/5" : "bg-white/10"} flex px-2 rounded-full py-0.5 items-center gap-1 transition-colors duration-300`}>
                    <BluetoothIcon enabled={bluetooth.enabled} connected={bluetooth.connected} color={iconColor} />
                    <NetworkIcon signal={network.signal} connected={network.connected} type={network.type} color={iconColor} />
                </div>
            }
        >
            <ControlCenter network={network} bluetooth={bluetooth} volume={volume} setVolume={setVolume} muted={muted} toggleMute={toggleMute} monitors={monitors} setMonitorBrightness={setMonitorBrightness} />
        </PopupMenu>
    );
}

import { useEffect, useState } from "react";
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Bluetooth, BluetoothConnected, BluetoothOff, EthernetPort, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react";
import { useBattery } from "../../../hooks/useBattery";
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

function BatteryIcon({ percent, charging, color }: { percent: number | null; charging: boolean; color: string }) {
    if (charging) return <BatteryCharging className="ml-0.5" color={color} size={16} />;
    if (percent === null) return <Battery color={color} className="ml-0.5" size={16} />;
    if (percent >= 80) return <BatteryFull color={color} className="ml-0.5" size={16} />;
    if (percent >= 40) return <BatteryMedium color={color} className="ml-0.5" size={16} />;
    if (percent >= 15) return <BatteryLow color={color} className="ml-0.5" size={16} />;
    return <BatteryWarning color={color} className="ml-0.5" size={16} />
}

export default function StatusIndicator() {
    const darkText = useDarkText();
    const battery = useBattery();
    const network = useNetworkStatus();
    const bluetooth = useBluetooth();
    const { volume, setVolume, muted, toggleMute } = useVolume();
    const { monitors, setBrightness: setMonitorBrightness } = useMonitors();
    const iconColor = darkText ? "black" : "white";

    const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
    const [wifiScanning, setWifiScanning] = useState(false);
    const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
    const [btScanning, setBtScanning] = useState(false);

    function scanWifi() {
        setWifiScanning(true);
        window.shell.network.wifiScan().then((result) => {
            if (result) setWifiNetworks(result);
            setWifiScanning(false);
        });
    }

    function scanBluetooth() {
        setBtScanning(true);
        window.shell.system.bluetoothScan().then((result) => {
            setBtDevices(result);
            setBtScanning(false);
        });
    }

    function scanAll() {
        scanWifi();
        scanBluetooth();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        scanAll();
        window.shell.network.onWifiScanUpdated((data) => {
            setWifiNetworks(data);
            setWifiScanning(false);
        });
        window.shell.system.onBluetoothDevicesChanged((data) => {
            setBtDevices(data);
        });
    }, []);

    return (
        <PopupMenu
            onOpen={scanAll}
            trigger={
                <div className={`${darkText ? "bg-black/5" : "bg-white/10"} flex px-2 rounded-full py-0.5 items-center gap-1 transition-colors duration-300`}>
                    <BluetoothIcon enabled={bluetooth.enabled} connected={bluetooth.connected} color={iconColor} />
                    <NetworkIcon signal={network.signal} connected={network.connected} type={network.type} color={iconColor} />
                    {battery.hasBattery && <BatteryIcon percent={battery.percent} charging={battery.charging} color={iconColor} />}
                </div>
            }
        >
            <ControlCenter
                battery={battery} network={network} bluetooth={bluetooth}
                volume={volume} setVolume={setVolume} muted={muted} toggleMute={toggleMute}
                monitors={monitors} setMonitorBrightness={setMonitorBrightness}
                wifiNetworks={wifiNetworks} wifiScanning={wifiScanning} scanWifi={scanWifi}
                btDevices={btDevices} btScanning={btScanning} scanBluetooth={scanBluetooth}
            />
        </PopupMenu>
    );
}

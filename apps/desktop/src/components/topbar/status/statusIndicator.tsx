import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Bluetooth, BluetoothConnected, BluetoothOff, EthernetPort, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react";
import { useBattery } from "../../../hooks/useBattery";
import { useBluetooth } from "../../../hooks/useBluetooth";
import { useMonitors } from "../../../hooks/useMonitors";
import { useVolume } from "../../../hooks/useVolume";
import { useNetworkStatus } from "../../../hooks/useNetwork";
import { indicatorKind } from "../../../lib/bluetoothPresentation";
import ControlCenter from "./controlCenter";
import PopupMenu from "../shared/popupMenu";
import { useDarkText } from "../../themeContext";

function NetworkIcon({ signal, connected, type, radioOn, color }: { signal: number | null; connected: boolean; type: string; radioOn: boolean; color: string }) {
    if (type === 'ethernet') {
        return <EthernetPort color={color} size={14} />;
    }

    if (!radioOn) return <WifiOff color={color} size={14} />;
    if (!connected) return <WifiOff color={color} size={14} />;
    if (signal === null) return <Wifi color={color} size={14} />;
    if (signal >= 70) return <Wifi color={color} size={14} />;
    if (signal >= 40) return <WifiHigh color={color} size={14} />;
    if (signal >= 10) return <WifiLow color={color} size={14} />;
    return <WifiZero color={color} size={14} />;
}

function BluetoothIcon({ kind, color }: { kind: BluetoothIndicatorKind; color: string }) {
    if (kind === 'off') return <BluetoothOff color={color} size={14} />;
    if (kind === 'connected') return <BluetoothConnected color={color} size={14} />;
    return <Bluetooth color={color} size={14} opacity={kind === 'neutral' ? 0.5 : 1} />;
}

function BatteryIcon({ percent, charging, color }: { percent: number | null; charging: boolean; color: string }) {
    if (charging) return <BatteryCharging className="ml-0.5" color={color} size={16} />;
    if (percent === null) return <Battery color={color} className="ml-0.5" size={16} />;
    if (percent >= 80) return <BatteryFull color={color} className="ml-0.5" size={16} />;
    if (percent >= 40) return <BatteryMedium color={color} className="ml-0.5" size={16} />;
    if (percent >= 15) return <BatteryLow color={color} className="ml-0.5" size={16} />;
    return <BatteryWarning color={color} className="ml-0.5" size={16} />
}

function requestWifiScan(setNetworks: Dispatch<SetStateAction<WifiNetwork[]>>, setScanning: Dispatch<SetStateAction<boolean>>) {
    window.shell.network.wifiScan().then((result) => {
        if (result) setNetworks(result);
        setScanning(false);
    });
}

function requestWifiRadio(setRadio: Dispatch<SetStateAction<boolean>>) {
    window.shell.network.wifiRadioGet().then((r) => {
        if (r.success) setRadio(r.state === 'on');
    });
}

export default function StatusIndicator() {
    const darkText = useDarkText();
    const battery = useBattery();
    const network = useNetworkStatus();
    const { state: bluetooth } = useBluetooth();
    const { volume, setVolume, muted, toggleMute } = useVolume();
    const { monitors, setBrightness: setMonitorBrightness } = useMonitors();
    const iconColor = darkText ? "black" : "white";

    const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
    const [wifiScanning, setWifiScanning] = useState(true);
    const [wifiRadio, setWifiRadio] = useState(true);

    function toggleWifiRadio(enabled: boolean) {
        setWifiRadio(enabled);
        window.shell.network.wifiRadioSet(enabled).then((r) => {
            if (r.success) setWifiRadio(r.state === 'on');
            else requestWifiRadio(setWifiRadio);
        });
    }

    function scanWifi() {
        setWifiScanning(true);
        requestWifiScan(setWifiNetworks, setWifiScanning);
    }

    function refreshWifi() {
        scanWifi();
        requestWifiRadio(setWifiRadio);
    }

    useEffect(() => {
        requestWifiScan(setWifiNetworks, setWifiScanning);
        requestWifiRadio(setWifiRadio);
        return window.shell.network.onWifiScanUpdated((data) => {
            setWifiNetworks(data);
            setWifiScanning(false);
        });
    }, []);

    return (
        <PopupMenu
            onOpen={refreshWifi}
            trigger={
                <div className={`${darkText ? "bg-black/5" : "bg-white/10"} flex px-2 rounded-full h-4.5 items-center gap-1 transition-colors duration-300`}>
                    <BluetoothIcon kind={indicatorKind(bluetooth)} color={iconColor} />
                    <NetworkIcon signal={network.signal} connected={network.connected} type={network.type} radioOn={wifiRadio} color={iconColor} />
                    {battery.hasBattery && <BatteryIcon percent={battery.percent} charging={battery.charging} color={iconColor} />}
                </div>
            }
        >
            <ControlCenter
                battery={battery} network={network} bluetooth={bluetooth}
                volume={volume} setVolume={setVolume} muted={muted} toggleMute={toggleMute}
                monitors={monitors} setMonitorBrightness={setMonitorBrightness}
                wifiNetworks={wifiNetworks} wifiScanning={wifiScanning} scanWifi={scanWifi}
                wifiRadio={wifiRadio} onToggleWifiRadio={toggleWifiRadio}
            />
        </PopupMenu>
    );
}

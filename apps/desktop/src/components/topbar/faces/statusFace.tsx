import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Bluetooth, BluetoothConnected, BluetoothOff, EthernetPort, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react";
import { indicatorKind } from "../../../lib/bluetoothPresentation";

function NetworkIcon({ network, wifiRadio, darkText }: Pick<StatusFaceProps, "network" | "wifiRadio" | "darkText">) {
    const color = darkText ? "black" : "white";
    if (network.type === "ethernet") return <EthernetPort color={color} size={14} />;
    if (wifiRadio !== 'on') return <WifiOff color={color} size={14} />;
    if (!network.connected) return <WifiOff color={color} size={14} />;
    if (network.signal === null) return <Wifi color={color} size={14} />;
    if (network.signal >= 70) return <Wifi color={color} size={14} />;
    if (network.signal >= 40) return <WifiHigh color={color} size={14} />;
    if (network.signal >= 10) return <WifiLow color={color} size={14} />;
    return <WifiZero color={color} size={14} />;
}

function BluetoothIcon({ bluetooth, darkText }: Pick<StatusFaceProps, "bluetooth" | "darkText">) {
    const color = darkText ? "black" : "white";
    const kind = indicatorKind(bluetooth);
    if (kind === "off") return <BluetoothOff color={color} size={14} />;
    if (kind === "connected") return <BluetoothConnected color={color} size={14} />;
    return <Bluetooth color={color} size={14} opacity={kind === "neutral" ? 0.5 : 1} />;
}

function BatteryIcon({ battery, darkText }: Pick<StatusFaceProps, "battery" | "darkText">) {
    const color = darkText ? "black" : "white";
    if (battery.charging) return <BatteryCharging className="ml-0.5" color={color} size={16} />;
    if (battery.percent === null) return <Battery color={color} className="ml-0.5" size={16} />;
    if (battery.percent >= 80) return <BatteryFull color={color} className="ml-0.5" size={16} />;
    if (battery.percent >= 40) return <BatteryMedium color={color} className="ml-0.5" size={16} />;
    if (battery.percent >= 15) return <BatteryLow color={color} className="ml-0.5" size={16} />;
    return <BatteryWarning color={color} className="ml-0.5" size={16} />;
}

export default function StatusFace({ bluetooth, network, wifiRadio, battery, darkText }: StatusFaceProps) {
    return (
        <div className={`${darkText ? "bg-black/5" : "bg-white/10"} flex px-2 rounded-full h-4.5 items-center gap-1 transition-colors duration-300`}>
            <BluetoothIcon bluetooth={bluetooth} darkText={darkText} />
            <NetworkIcon network={network} wifiRadio={wifiRadio} darkText={darkText} />
            {battery.hasBattery && <BatteryIcon battery={battery} darkText={darkText} />}
        </div>
    );
}

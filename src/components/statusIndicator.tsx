import { useEffect, useRef, useState } from "react";
import { Bluetooth, BluetoothConnected, BluetoothOff, EthernetPort, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react";
import { useBluetooth } from "../hooks/useBluetooth";
import { useBrightness } from "../hooks/useBrightness";
import { useVolume } from "../hooks/useVolume";
import { useNetworkStatus } from "../hooks/useWifiSignal";
import ControlCenter from "./controllCenter";

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
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const network = useNetworkStatus();
    const bluetooth = useBluetooth();
    const [volume, setVolume] = useVolume();
    const [brightness, setBrightness] = useBrightness();

    useEffect(() => {
        if (open) {
            window.topbar.setHeight(500);
        } else {
            window.topbar.setHeight(24);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleBlur() {
            setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        window.addEventListener("blur", handleBlur);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            window.removeEventListener("blur", handleBlur);
        };
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <div
                className="bg-white/10 flex px-2 rounded-full py-0.5 items-center gap-1 cursor-pointer"
                onClick={() => setOpen(!open)}
            >
                <BluetoothIcon enabled={bluetooth.enabled} connected={bluetooth.connected} />
                <NetworkIcon signal={network.signal} connected={network.connected} type={network.type} />
            </div>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onMouseDown={() => setOpen(false)}
                    />
                    <div className="absolute top-full right-0 mt-1 z-50">
                        <ControlCenter network={network} bluetooth={bluetooth} volume={volume} setVolume={setVolume} brightness={brightness} setBrightness={setBrightness} />
                    </div>
                </>
            )}
        </div>
    );
}

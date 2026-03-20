import { useState } from "react";
import { Bluetooth, BluetoothConnected, ChevronLeft, Loader2, Plus, RefreshCw } from "lucide-react";

interface BluetoothMenuProps {
    devices: BluetoothDevice[];
    scanning: boolean;
    onScan: () => void;
    onBack: () => void;
    darkText: boolean;
}

export default function BluetoothMenu({ devices, scanning, onScan, onBack, darkText }: BluetoothMenuProps) {
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    const [togglingId, setTogglingId] = useState<string | null>(null);

    function handleToggle(device: BluetoothDevice) {
        if (togglingId) return;
        const action = device.connected ? "disconnect" : "connect";
        setTogglingId(device.instanceId);
        window.shell.system.bluetoothToggle(device.instanceId, action).then(() => {
            setTogglingId(null);
            onScan();
        });
    }

    return (
        <div className="p-3 flex flex-col gap-2 w-65">
            <div className="flex items-center justify-between mb-1">
                <div className={`flex items-center gap-2 cursor-pointer ${darkText ? "text-black" : "text-white"}`} onClick={onBack}>
                    <ChevronLeft color={color} size={16} />
                    <span className="text-sm font-medium">Bluetooth</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => window.shell.system.bluetoothOpenSettings()} className="cursor-pointer">
                        <Plus color={dimColor} size={15} />
                    </button>
                    <button onClick={onScan} disabled={scanning} className="cursor-pointer">
                        <RefreshCw color={dimColor} size={14} className={scanning ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {scanning && devices.length === 0 ? (
                <div className={`flex items-center justify-center py-6 ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <Loader2 size={20} className="animate-spin" />
                </div>
            ) : devices.length === 0 ? (
                <div className={`flex flex-col items-center gap-2 py-4 ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <Bluetooth size={20} />
                    <span className="text-sm">No devices</span>
                </div>
            ) : (
                <div className="flex flex-col gap-0.5">
                    {devices.map((device) => {
                        const toggling = togglingId === device.instanceId;
                        return (
                            <div
                                key={device.instanceId}
                                onClick={() => handleToggle(device)}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer ${darkText ? "hover:bg-black/5" : "hover:bg-white/10"} transition-colors`}
                            >
                                <div className={`flex items-center gap-2.5 ${darkText ? "text-black" : "text-white"}`}>
                                    {toggling
                                        ? <Loader2 color={dimColor} size={15} className="animate-spin" />
                                        : device.connected
                                            ? <BluetoothConnected color={color} size={15} />
                                            : <Bluetooth color={dimColor} size={15} />
                                    }
                                    <div className="flex flex-col">
                                        <span className={`text-[13px] ${device.connected ? "" : (darkText ? "text-black/70" : "text-white/70")}`}>{device.name}</span>
                                        <span className={`text-[11px] -mt-0.5 ${darkText ? "text-black/50" : "text-white/50"}`}>
                                            {toggling
                                                ? (device.connected ? "Disconnecting..." : "Connecting...")
                                                : (device.connected ? "Connected" : "Not Connected")
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

        </div>
    );
}

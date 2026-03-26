import { useState, useEffect, useRef } from "react";
import { Bluetooth, BluetoothConnected, ChevronLeft, Loader2, Plus, RefreshCw } from "lucide-react";

interface BluetoothMenuProps {
    devices: BluetoothDevice[];
    scanning: boolean;
    onScan: () => void;
    onBack: () => void;
    darkText: boolean;
}

type RowPhase = "idle" | "toggling" | "settling";

function DeviceRow({ device, phase, onToggle, darkText }: { device: BluetoothDevice; phase: RowPhase; onToggle: () => void; darkText: boolean }) {
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";

    const showSpinner = phase === "toggling";
    const showFinal = phase === "idle";

    return (
        <div
            onClick={onToggle}
            className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer ${darkText ? "hover:bg-black/5" : "hover:bg-white/10"} transition-colors`}
        >
            <div className={`flex items-center gap-2.5 ${darkText ? "text-black" : "text-white"}`}>
                <div className="relative w-3.75 h-3.75 shrink-0">
                    <div
                        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
                        style={{ opacity: showSpinner ? 1 : 0 }}
                    >
                        <Loader2 color={dimColor} size={15} className="animate-spin" />
                    </div>
                    <div
                        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
                        style={{ opacity: showFinal && device.connected ? 1 : 0 }}
                    >
                        <BluetoothConnected color={color} size={15} />
                    </div>
                    <div
                        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
                        style={{ opacity: showFinal && !device.connected ? 1 : 0 }}
                    >
                        <Bluetooth color={dimColor} size={15} />
                    </div>
                </div>
                <div className="flex flex-col overflow-hidden">
                    <span
                        className="text-[13px] transition-[color] duration-300"
                        style={{ color: device.connected && showFinal ? undefined : (darkText ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)") }}
                    >
                        {device.name}
                    </span>
                    <div className="relative h-3.5 -mt-0.5">
                        <span
                            className={`absolute text-[11px] transition-all duration-300 ${darkText ? "text-black/50" : "text-white/50"}`}
                            style={{
                                opacity: showSpinner ? 1 : 0,
                                transform: showSpinner ? "translateY(0)" : "translateY(-4px)",
                            }}
                        >
                            {device.connected ? "Disconnecting..." : "Connecting..."}
                        </span>
                        <span
                            className={`absolute text-[11px] transition-all duration-300 ${darkText ? "text-black/50" : "text-white/50"}`}
                            style={{
                                opacity: showFinal ? 1 : 0,
                                transform: showFinal ? "translateY(0)" : "translateY(4px)",
                            }}
                        >
                            {device.connected ? "Connected" : "Paired"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function BluetoothMenu({ devices, scanning, onScan, onBack, darkText }: BluetoothMenuProps) {
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [phase, setPhase] = useState<RowPhase>("idle");
    const toggleStartState = useRef<boolean | null>(null);

    function handleToggle(device: BluetoothDevice) {
        if (togglingId) return;
        toggleStartState.current = device.connected;
        setTogglingId(device.instanceId);
        setPhase("toggling");
        window.shell.system.bluetoothToggle(device.instanceId, device.connected ? "disconnect" : "connect");
    }

    useEffect(() => {
        if (phase === "toggling" && togglingId && toggleStartState.current !== null) {
            const current = devices.find(d => d.instanceId === togglingId);
            if (current && current.connected !== toggleStartState.current) {
                setPhase("settling");
            }
        }
    }, [devices, togglingId, phase]);

    useEffect(() => {
        if (phase === "settling") {
            const t = setTimeout(() => {
                setPhase("idle");
                setTogglingId(null);
                toggleStartState.current = null;
            }, 350);
            return () => clearTimeout(t);
        }
    }, [phase]);

    function getPhase(deviceId: string): RowPhase {
        if (togglingId !== deviceId) return "idle";
        return phase;
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
                    {devices.map((device) => (
                        <DeviceRow
                            key={device.instanceId}
                            device={device}
                            phase={getPhase(device.instanceId)}
                            onToggle={() => handleToggle(device)}
                            darkText={darkText}
                        />
                    ))}
                </div>
            )}

        </div>
    );
}

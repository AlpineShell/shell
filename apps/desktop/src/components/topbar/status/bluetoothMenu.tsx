import { useEffect, useState } from "react";
import { Bluetooth, BluetoothConnected, ChevronLeft, Loader2, Plus, RefreshCw } from "lucide-react";
import { useBluetooth } from "../../../hooks/useBluetooth";
import { canToggleRadio, deviceActionLabel, deviceStatusLabel, displayedRadioOn, nextDeviceAction, radioEmptyStateTitle, radioErrorLabel } from "../../../lib/bluetoothPresentation";

interface BluetoothMenuProps {
    onBack: () => void;
    darkText: boolean;
}

function ToggleSwitch({ checked, pending, disabled, onChange, darkText }: { checked: boolean; pending: boolean; disabled: boolean; onChange: (v: boolean) => void; darkText: boolean }) {
    const onColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)";
    const offColor = darkText ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.18)";
    const knobOn = darkText ? "rgb(255,255,255)" : "rgb(20,20,20)";
    const knobOff = darkText ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)";
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label="Bluetooth"
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative shrink-0 rounded-full transition-[background-color,opacity] ${disabled ? "cursor-default" : "cursor-pointer"}`}
            style={{ width: 26, height: 14, backgroundColor: checked ? onColor : offColor, opacity: pending ? 0.55 : 1 }}
        >
            <span
                className="absolute top-0.5 rounded-full transition-all"
                style={{
                    width: 10,
                    height: 10,
                    left: checked ? 14 : 2,
                    backgroundColor: checked ? knobOn : knobOff,
                }}
            />
        </button>
    );
}

function DeviceRow({ device, onToggle, darkText }: { device: BluetoothDevice; onToggle: () => void; darkText: boolean }) {
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    const busy = device.pending !== null;
    const actionable = nextDeviceAction(device) !== null;
    const statusColor = device.error
        ? (darkText ? "text-red-700" : "text-red-300")
        : (darkText ? "text-black/50" : "text-white/50");

    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={!actionable}
            aria-label={deviceActionLabel(device)}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-colors ${actionable ? `cursor-pointer ${darkText ? "hover:bg-black/5" : "hover:bg-white/10"}` : "cursor-default"}`}
        >
            <div className={`flex items-center gap-2.5 min-w-0 ${darkText ? "text-black" : "text-white"}`}>
                <div className="relative w-3.75 h-3.75 shrink-0">
                    <div
                        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
                        style={{ opacity: busy ? 1 : 0 }}
                    >
                        <Loader2 color={dimColor} size={15} className="animate-spin" />
                    </div>
                    <div
                        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
                        style={{ opacity: !busy && device.connected ? 1 : 0 }}
                    >
                        <BluetoothConnected color={color} size={15} />
                    </div>
                    <div
                        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
                        style={{ opacity: !busy && !device.connected ? 1 : 0 }}
                    >
                        <Bluetooth color={dimColor} size={15} />
                    </div>
                </div>
                <div className="flex flex-col min-w-0">
                    <span
                        className="text-[13px] truncate transition-[color] duration-300"
                        style={{ color: device.connected && !busy ? undefined : (darkText ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)") }}
                    >
                        {device.name}
                    </span>
                    <span className={`text-[11px] -mt-0.5 ${statusColor}`}>{deviceStatusLabel(device)}</span>
                </div>
            </div>
        </button>
    );
}

export default function BluetoothMenu({ onBack, darkText }: BluetoothMenuProps) {
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    const { state, toggleDevice, setRadio, refresh, openPairing } = useBluetooth();
    const [refreshing, setRefreshing] = useState(false);
    const radioOn = displayedRadioOn(state);
    const notice = radioEmptyStateTitle(state);
    const radioError = radioErrorLabel(state.radio.error);

    useEffect(() => {
        refresh();
    }, [refresh]);

    function rescan() {
        setRefreshing(true);
        refresh().finally(() => setRefreshing(false));
    }

    return (
        <div className="p-3 flex flex-col gap-2 w-65">
            <div className="flex items-center justify-between mb-1">
                <button type="button" aria-label="Back" onClick={onBack} className={`flex items-center gap-2 cursor-pointer ${darkText ? "text-black" : "text-white"}`}>
                    <ChevronLeft color={color} size={16} />
                    <span className="text-sm font-medium">Bluetooth</span>
                </button>
                <div className="flex items-center gap-2.5">
                    <button type="button" aria-label="Pair new device" onClick={() => openPairing()} className="cursor-pointer" disabled={!radioOn}>
                        <Plus color={dimColor} size={15} style={{ opacity: radioOn ? 1 : 0.4 }} />
                    </button>
                    <button type="button" aria-label="Rescan" onClick={rescan} disabled={refreshing || !radioOn} className="cursor-pointer">
                        <RefreshCw color={dimColor} size={14} className={refreshing ? "animate-spin" : ""} style={{ opacity: radioOn ? 1 : 0.4 }} />
                    </button>
                    <div style={{ marginLeft: 4 }}>
                        <ToggleSwitch
                            checked={radioOn}
                            pending={state.radio.pending !== null}
                            disabled={!canToggleRadio(state)}
                            onChange={(on) => setRadio(on)}
                            darkText={darkText}
                        />
                    </div>
                </div>
            </div>

            {radioError && <span className={`text-[11px] ${darkText ? "text-red-700" : "text-red-300"}`}>{radioError}</span>}

            {notice ? (
                <div className={`flex flex-col items-center gap-2 py-4 ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <Bluetooth size={20} />
                    <span className="text-sm">{notice}</span>
                </div>
            ) : (
                <div className="flex flex-col gap-0.5">
                    {state.devices.map((device) => (
                        <DeviceRow
                            key={device.id}
                            device={device}
                            onToggle={() => toggleDevice(device)}
                            darkText={darkText}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

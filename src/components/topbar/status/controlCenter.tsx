import { useRef, useState, useEffect } from "react";
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Bluetooth, ChevronRight, Sun, Volume2, VolumeX, Wifi } from "lucide-react";
import { useDarkText } from "../../themeContext";
import WifiMenu from "./wifiMenu";
import BluetoothMenu from "./bluetoothMenu";

interface ControlCenterProps {
    battery: BatteryStatus;
    network: { connected: boolean; ssid: string | null };
    bluetooth: { enabled: boolean; connected: boolean; devices: string[] };
    volume: number;
    setVolume: (value: number) => void;
    muted: boolean;
    toggleMute: () => void;
    monitors: MonitorInfo[];
    setMonitorBrightness: (id: string, value: number) => void;
    wifiNetworks: WifiNetwork[];
    wifiScanning: boolean;
    scanWifi: () => void;
    btDevices: BluetoothDevice[];
    btScanning: boolean;
    scanBluetooth: () => void;
}

function batteryLabel(battery: BatteryStatus): string | undefined {
    if (battery.percent === null) return undefined;
    return `${battery.percent}%`;
}

function batteryIcon(percent: number | null, charging: boolean): React.FC<{ color: string; size: number }> {
    if (charging) return BatteryCharging;
    if (percent === null) return BatteryMedium;
    if (percent >= 80) return BatteryFull;
    if (percent >= 40) return BatteryMedium;
    if (percent >= 15) return BatteryLow;
    return BatteryWarning;
}

type View = 'main' | 'wifi' | 'bluetooth';

export default function ControlCenter({ battery, network, bluetooth, volume, setVolume, muted, toggleMute, monitors, setMonitorBrightness, wifiNetworks, wifiScanning, scanWifi, btDevices, btScanning, scanBluetooth }: ControlCenterProps) {
    const darkText = useDarkText();
    const [view, setView] = useState<View>('main');

    const wifiLabel = network.connected ? (network.ssid ?? "Connected") : undefined;

    let btLabel: string | undefined;
    if (bluetooth.enabled && bluetooth.connected) {
        btLabel = bluetooth.devices.length > 1
            ? `${bluetooth.devices.length} Connected`
            : bluetooth.devices[0] ?? "Connected";
    }

    const mainRef = useRef<HTMLDivElement>(null);
    const subRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);

    useEffect(() => {
        requestAnimationFrame(() => {
            const el = view === 'main' ? mainRef.current : subRef.current;
            if (el) setHeight(el.offsetHeight);
        });
    }, [view, wifiNetworks, btDevices, wifiScanning, btScanning]);

    return (
        <div className="overflow-hidden w-65 transition-[height] duration-200 ease-in-out" style={{ height: height ? `${height}px` : 'auto' }}>
            <div
                className="flex transition-transform duration-200 ease-in-out"
                style={{ transform: view === 'main' ? 'translateX(0)' : 'translateX(-100%)' }}
            >
                <div ref={mainRef} className="p-3 gap-3 flex flex-col h-fit w-65 shrink-0">
                    <div className="gap-3 mb-1 flex flex-col">
                        <ControlItem label="Wi-Fi" sublabel={wifiLabel} Icon={Wifi} darkText={darkText} onClick={() => setView('wifi')} />
                        <ControlItem label="Bluetooth" sublabel={btLabel} Icon={Bluetooth} darkText={darkText} onClick={() => setView('bluetooth')} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Slider Icon={muted ? VolumeX : Volume2} value={volume} onChange={setVolume} onIconClick={toggleMute} muted={muted} darkText={darkText} />
                        {monitors.map((m, i) => (
                            <Slider
                                key={m.id}
                                Icon={monitors.length > 1 ? undefined : Sun}
                                iconSrc={monitors.length > 1 ? `/icons/monitor/Monitor ${i + 1}.svg` : undefined}
                                value={m.brightness}
                                onChange={(v) => setMonitorBrightness(m.id, v)}
                                darkText={darkText}
                            />
                        ))}
                    </div>
                    {battery.hasBattery && (() => {
                        const BattIcon = batteryIcon(battery.percent, battery.charging);
                        return (
                            <div className={`flex items-center justify-end gap-1.5 text-sm ${darkText ? "text-black" : "text-white"}`}>
                                <span className="text-[13px]">{batteryLabel(battery) ?? "Battery"}</span>
                                <BattIcon color={darkText ? "black" : "white"} size={18} />
                            </div>
                        );
                    })()}
                </div>

                <div ref={subRef} className="w-65 shrink-0 self-start">
                    {view === 'wifi' && <WifiMenu networks={wifiNetworks} scanning={wifiScanning} onScan={scanWifi} onBack={() => setView('main')} darkText={darkText} />}
                    {view === 'bluetooth' && <BluetoothMenu devices={btDevices} scanning={btScanning} onScan={scanBluetooth} onBack={() => setView('main')} darkText={darkText} />}
                </div>
            </div>
        </div>
    )
}

function ControlItem({ label, sublabel, Icon, darkText, onClick }: { label: string; sublabel?: string; Icon: React.FC<{ color: string; size: number }>; darkText: boolean; onClick?: () => void }) {
    const active = !!sublabel;
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    return (
        <div className={`flex cursor-pointer justify-between items-center ${darkText ? "text-black" : "text-white"}`} onClick={onClick}>
            {active ? (
                <div className="flex mx-1 gap-3 text-sm items-center">
                    <Icon color={color} size={17} />
                    <div className="flex flex-col gap-0">
                        <span className="text-xs">{label}</span>
                        <span className={`text-[13px] ${darkText ? "text-black/60" : "text-white/60"} -mt-0.5`}>{sublabel}</span>
                    </div>
                </div>
            ) : (
                <div className={`flex gap-2 text-sm items-center ${darkText ? "text-black/60" : "text-white/60"}`}>
                    <Icon color={dimColor} size={15} />
                    {label}
                </div>
            )}
            <ChevronRight color={active ? color : dimColor} size={15} />
        </div>
    )
}

function Slider({ Icon, iconSrc, value, onChange, label, onIconClick, muted, darkText }: { Icon?: React.FC<{ color: string; size: number }>; iconSrc?: string; value: number; onChange: (value: number) => void; label?: string; onIconClick?: () => void; muted?: boolean; darkText: boolean }) {
    const dragging = useRef(false);
    const color = darkText ? "black" : "white";
    const mutedColor = darkText ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
    return (
        <div className="flex flex-col gap-1">
            {label && <span className={`text-[11px] ${darkText ? "text-black/50" : "text-white/50"} ml-1`}>{label}</span>}
            <div className={`flex ${darkText ? "bg-black/5" : "bg-[#3F3F3F]/20"} p-3 rounded-md ${darkText ? "text-black" : "text-white"} items-center gap-3`}>
            <div className={`shrink-0 ${onIconClick ? 'cursor-pointer' : ''}`} onClick={onIconClick}>
                {iconSrc ? (
                    <img src={iconSrc} alt="" className="w-3.75 h-3.75" style={{ filter: darkText ? 'brightness(0)' : 'brightness(0) invert(1)' }} draggable={false} />
                ) : Icon ? (
                    <Icon color={muted ? mutedColor : color} size={15} />
                ) : null}
            </div>
            <input
                type="range"
                min={0}
                max={100}
                value={value}
                onPointerDown={() => { dragging.current = true }}
                onPointerUp={() => { dragging.current = false }}
                onLostPointerCapture={() => { dragging.current = false }}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`cc-slider w-full ${dragging.current ? 'dragging' : 'animate'} ${darkText ? 'cc-slider-light' : ''}`}
                style={{ '--slider-progress': `${value}%` } as React.CSSProperties}
            />
            </div>
        </div>
    )
}

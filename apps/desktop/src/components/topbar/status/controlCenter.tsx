import { useRef, useState, useEffect } from "react";
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Bluetooth, ChevronRight, Settings, Speaker, Sun, Volume2, VolumeX, Wifi } from "lucide-react";
import { useDarkText } from "../../themeContext";
import { connectedSummary, displayedRadioOn } from "../../../lib/bluetoothPresentation";
import { brightnessNeedsSubmenu } from "../../../lib/brightnessPresentation";
import { defaultAudioDevice, useAudioDevices } from "../../../hooks/useAudioDevices";
import { useStatusSound } from "../../../hooks/useStatusSound";
import WifiMenu from "./wifiMenu";
import BluetoothMenu from "./bluetoothMenu";
import BrightnessMenu from "./brightnessMenu";
import SoundMenu from "./soundMenu";
import ControlSlider from "./controlSlider";

interface ControlCenterProps {
    battery: BatteryStatus;
    network: NetworkStatus;
    bluetooth: BluetoothState;
    volume: number;
    setVolume: (value: number) => void;
    muted: boolean;
    toggleMute: () => void;
    monitors: MonitorInfo[];
    setMonitorBrightness: (id: string, value: number) => void;
    wifiState: WifiState;
    onToggleWifiRadio: (enabled: boolean) => void;
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

type View = 'main' | 'wifi' | 'bluetooth' | 'sound' | 'brightness';

export default function ControlCenter({ battery, network, bluetooth, volume, setVolume, muted, toggleMute, monitors, setMonitorBrightness, wifiState, onToggleWifiRadio }: ControlCenterProps) {
    const darkText = useDarkText();
    const [view, setView] = useState<View>('main');

    const wifiLabel = wifiState.blockedByEthernet
        ? 'Ethernet'
        : network.wifi.connected && network.wifi.ssid
            ? network.wifi.ssid
            : wifiState.radio !== 'on' && wifiState.ethernet ? 'Ethernet' : undefined;
    const wifiActive = !wifiState.blockedByEthernet && wifiState.radio === 'on';

    const btLabel = connectedSummary(bluetooth);
    const showSound = useStatusSound();
    const audio = useAudioDevices();
    const soundLabel = defaultAudioDevice(audio.devices.output)?.name;
    const brightnessIsSubmenu = brightnessNeedsSubmenu(monitors);

    const mainRef = useRef<HTMLDivElement>(null);
    const subRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);

    useEffect(() => {
        const el = view === 'main' ? mainRef.current : subRef.current;
        if (!el) return;
        const update = () => setHeight(el.offsetHeight);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, [view]);

    return (
        <div className="overflow-hidden w-65 transition-[height] duration-200 ease-in-out" style={{ height: height ? `${height}px` : 'auto' }}>
            <div
                className="flex transition-transform duration-200 ease-in-out"
                style={{ transform: view === 'main' ? 'translateX(0)' : 'translateX(-100%)' }}
            >
                <div ref={mainRef} className="p-3 gap-3 flex flex-col h-fit w-65 shrink-0">
                    <div className="gap-3 mb-1 flex flex-col">
                        <ControlItem label="Wi-Fi" sublabel={wifiLabel} active={wifiActive} Icon={Wifi} darkText={darkText} onClick={() => setView('wifi')} />
                        <ControlItem label="Bluetooth" sublabel={btLabel} active={displayedRadioOn(bluetooth)} Icon={Bluetooth} darkText={darkText} onClick={() => setView('bluetooth')} />
                        {showSound && <ControlItem label="Sound" sublabel={soundLabel} active Icon={Speaker} darkText={darkText} onClick={() => setView('sound')} />}
                        {brightnessIsSubmenu && <ControlItem label="Brightness" active Icon={Sun} darkText={darkText} onClick={() => setView('brightness')} />}
                    </div>
                    <div className="flex flex-col gap-2">
                        <ControlSlider Icon={muted ? VolumeX : Volume2} ariaLabel="Volume" value={volume} onChange={setVolume} onIconClick={toggleMute} muted={muted} darkText={darkText} />
                        {!brightnessIsSubmenu && monitors.map((m) => (
                            <ControlSlider
                                key={m.id}
                                Icon={Sun}
                                ariaLabel="Brightness"
                                value={m.brightness}
                                onChange={(v) => setMonitorBrightness(m.id, v)}
                                darkText={darkText}
                            />
                        ))}
                    </div>
                    <div className={`flex items-center justify-between gap-1.5 text-sm ${darkText ? "text-black" : "text-white"}`}>
                        <button
                            onClick={() => window.shell.windows.openSettings()}
                            className={`w-6 h-6 flex items-center justify-center rounded-md cursor-pointer transition-colors ${darkText ? "hover:bg-black/10" : "hover:bg-white/10"}`}
                            aria-label="Open settings"
                        >
                            <Settings color={darkText ? "black" : "white"} size={15} />
                        </button>
                        {battery.hasBattery && (() => {
                            const BattIcon = batteryIcon(battery.percent, battery.charging);
                            return (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[13px]">{batteryLabel(battery) ?? "Battery"}</span>
                                    <BattIcon color={darkText ? "black" : "white"} size={18} />
                                </div>
                            );
                        })()}
                    </div>
                </div>

                <div ref={subRef} className="w-65 shrink-0 self-start">
                    {view === 'wifi' && <WifiMenu state={wifiState} onToggleRadio={onToggleWifiRadio} onBack={() => setView('main')} darkText={darkText} />}
                    {view === 'bluetooth' && <BluetoothMenu onBack={() => setView('main')} darkText={darkText} />}
                    {view === 'sound' && <SoundMenu devices={audio.devices} onSelect={audio.setDefault} onBack={() => setView('main')} darkText={darkText} />}
                    {view === 'brightness' && <BrightnessMenu monitors={monitors} setMonitorBrightness={setMonitorBrightness} onBack={() => setView('main')} darkText={darkText} />}
                </div>
            </div>
        </div>
    )
}

function ControlItem({ label, sublabel, active, Icon, darkText, onClick }: { label: string; sublabel?: string; active?: boolean; Icon: React.FC<{ color: string; size: number }>; darkText: boolean; onClick?: () => void }) {
    const isActive = active ?? !!sublabel;
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    return (
        <div className={`flex cursor-pointer justify-between items-center ${darkText ? "text-black" : "text-white"}`} onClick={onClick}>
            <div className="flex mx-1 gap-3 text-sm items-center">
                <Icon color={isActive ? color : dimColor} size={17} />
                <div className="flex flex-col gap-0">
                    <span className={sublabel ? 'text-xs' : `text-[13px] ${isActive ? '' : (darkText ? 'text-black/60' : 'text-white/60')}`}>{label}</span>
                    {sublabel && <span className={`text-[13px] ${darkText ? "text-black/60" : "text-white/60"} -mt-0.5`}>{sublabel}</span>}
                </div>
            </div>
            <ChevronRight color={isActive ? color : dimColor} size={15} />
        </div>
    )
}

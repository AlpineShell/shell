import { Bluetooth, ChevronRight, Sun, Volume2, Wifi } from "lucide-react";

interface ControlCenterProps {
    network: { connected: boolean; ssid: string | null };
    bluetooth: { enabled: boolean; connected: boolean; devices: string[] };
    volume: number;
    setVolume: (value: number) => void;
    brightness: number;
    setBrightness: (value: number) => void;
}

export default function ControlCenter({ network, bluetooth, volume, setVolume, brightness, setBrightness }: ControlCenterProps) {

    const wifiLabel = network.connected ? (network.ssid ?? "Connected") : undefined;

    let btLabel: string | undefined;
    if (bluetooth.enabled && bluetooth.connected) {
        btLabel = bluetooth.devices.length > 1
            ? `${bluetooth.devices.length} Connected`
            : bluetooth.devices[0] ?? "Connected";
    }

    return (
        <div className="bg-[#1f262d] border-[0.5px] border-[#313a46] p-3 gap-3 flex flex-col rounded-xl h-fit w-65 shadow-2xl">
            <div className="gap-3 mb-1 flex flex-col">
                <ControlItem label="Wi-Fi" sublabel={wifiLabel} Icon={Wifi} />
                <ControlItem label="Bluetooth" sublabel={btLabel} Icon={Bluetooth} />
            </div>
            <div className="flex flex-col gap-2">
                <Slider Icon={Volume2} value={volume} onChange={setVolume} />
                <Slider Icon={Sun} value={brightness} onChange={setBrightness} />
            </div>
        </div>
    )
}

function ControlItem({ label, sublabel, Icon }: { label: string; sublabel?: string; Icon: React.FC<{ color: string; size: number }> }) {
    const active = !!sublabel;
    return (
        <div className="flex cursor-pointer justify-between items-center text-white">
            {active ? (
                <div className="flex gap-2 text-sm items-center">
                    <Icon color="white" size={15} />
                    <div className="flex flex-col gap-0">
                        <span>{label}</span>
                        <span className="text-xs text-white/60 -mt-0.5">{sublabel}</span>
                    </div>
                </div>
            ) : (
                <div className="flex gap-2 text-sm items-center text-white/60">
                    <Icon color="rgba(255,255,255,0.6)" size={15} />
                    {label}
                </div>
            )}
            <ChevronRight color={active ? "white" : "rgba(255,255,255,0.6)"} size={15} />
        </div>
    )
}

function Slider({ Icon, value, onChange }: { Icon: React.FC<{ color: string; size: number }>; value: number; onChange: (value: number) => void }) {
    return (
        <div className="flex bg-[#3F3F3F]/20 p-3 rounded-md text-white items-center gap-3">
            <div className="shrink-0"><Icon color="white" size={15} /></div>
            <input
                type="range"
                min={0}
                max={100}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="cc-slider w-full"
                style={{ '--slider-progress': `${value}%` } as React.CSSProperties}
            />
        </div>
    )
}

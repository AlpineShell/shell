import { Bluetooth, ChevronRight, Wifi } from "lucide-react";

interface ControlCenterProps {
    network: { connected: boolean; ssid: string | null };
    bluetooth: { enabled: boolean; connected: boolean; devices: string[] };
}

export default function ControlCenter({ network, bluetooth }: ControlCenterProps) {

    const wifiLabel = network.connected ? (network.ssid ?? "Connected") : undefined;

    let btLabel: string | undefined;
    if (bluetooth.enabled && bluetooth.connected) {
        btLabel = bluetooth.devices.length > 1
            ? `${bluetooth.devices.length} Connected`
            : bluetooth.devices[0] ?? "Connected";
    }

    return (
        <div className="bg-[#1f262d] p-4 gap-5 flex flex-col border-[0.5px] border-[#2c343b] rounded-xl h-fit w-65 shadow-2xl">
            <ControlItem label="Wi-Fi" sublabel={wifiLabel} Icon={Wifi} />
            <ControlItem label="Bluetooth" sublabel={btLabel} Icon={Bluetooth} />
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

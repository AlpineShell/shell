import { Check, ChevronLeft } from "lucide-react";

interface SoundMenuProps {
    devices: AudioDevices;
    onSelect: (id: string) => void;
    onBack: () => void;
    darkText: boolean;
}

export default function SoundMenu({ devices, onSelect, onBack, darkText }: SoundMenuProps) {
    const color = darkText ? "black" : "white";
    return (
        <div className="p-3 flex flex-col gap-2 w-65">
            <div className="flex items-center mb-1">
                <button type="button" aria-label="Back" onClick={onBack} className={`flex items-center gap-2 cursor-pointer ${darkText ? "text-black" : "text-white"}`}>
                    <ChevronLeft color={color} size={16} />
                    <span className="text-sm font-medium">Sound</span>
                </button>
            </div>
            <DeviceGroup title="Output" devices={devices.output} onSelect={onSelect} darkText={darkText} />
            <DeviceGroup title="Input" devices={devices.input} onSelect={onSelect} darkText={darkText} />
        </div>
    );
}

function DeviceGroup({ title, devices, onSelect, darkText }: { title: string; devices: AudioDevice[]; onSelect: (id: string) => void; darkText: boolean }) {
    return (
        <div className="flex flex-col gap-0.5" role="group" aria-label={title}>
            <span className={`px-2 text-[11px] ${darkText ? "text-black/50" : "text-white/50"}`}>{title}</span>
            {devices.length === 0 && (
                <span className={`px-2 py-1.5 text-[13px] ${darkText ? "text-black/60" : "text-white/60"}`}>None connected</span>
            )}
            {devices.map((device) => (
                <DeviceRow key={device.id} device={device} onSelect={onSelect} darkText={darkText} />
            ))}
        </div>
    );
}

function DeviceRow({ device, onSelect, darkText }: { device: AudioDevice; onSelect: (id: string) => void; darkText: boolean }) {
    const color = darkText ? "black" : "white";
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={device.isDefault}
            onClick={() => { if (!device.isDefault) onSelect(device.id); }}
            className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left cursor-pointer transition-colors ${darkText ? "text-black hover:bg-black/5" : "text-white hover:bg-white/10"}`}
        >
            <span className={`text-[13px] truncate ${device.isDefault ? "" : darkText ? "text-black/70" : "text-white/70"}`}>{device.name}</span>
            {device.isDefault && <Check color={color} size={14} className="shrink-0" />}
        </button>
    );
}

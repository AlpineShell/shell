import { ChevronLeft, Laptop, Monitor } from "lucide-react";
import { monitorBrightnessLabel } from "../../../lib/brightnessPresentation";
import ControlSlider from "./controlSlider";

interface BrightnessMenuProps {
    monitors: MonitorInfo[];
    setMonitorBrightness: (id: string, value: number) => void;
    onBack: () => void;
    darkText: boolean;
}

export default function BrightnessMenu({ monitors, setMonitorBrightness, onBack, darkText }: BrightnessMenuProps) {
    const color = darkText ? "black" : "white";
    return (
        <div className="p-3 flex flex-col gap-2 w-65">
            <div className="flex items-center mb-1">
                <button type="button" onClick={onBack} className={`flex items-center gap-2 cursor-pointer ${darkText ? "text-black" : "text-white"}`}>
                    <ChevronLeft color={color} size={16} />
                    <span className="text-sm font-medium">Brightness</span>
                </button>
            </div>
            <div className="flex flex-col gap-2">
                {monitors.map((monitor) => (
                    <ControlSlider
                        key={monitor.id}
                        Icon={monitor.type === 'internal' ? Laptop : Monitor}
                        label={monitorBrightnessLabel(monitor)}
                        value={monitor.brightness}
                        onChange={(value) => setMonitorBrightness(monitor.id, value)}
                        darkText={darkText}
                    />
                ))}
            </div>
        </div>
    );
}

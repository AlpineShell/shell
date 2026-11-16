import { Volume1, Volume2, VolumeX } from "lucide-react";
import VolumeFill from "./volumeFill";

const ONE_WAVE_BELOW = 0.34;

function SpeakerIcon({ level, color }: { level: number; color: string }) {
    if (level <= 0) return <VolumeX color={color} size={13} className="shrink-0" />;
    if (level < ONE_WAVE_BELOW) return <Volume1 color={color} size={13} className="shrink-0" />;
    return <Volume2 color={color} size={13} className="shrink-0" />;
}

export default function VolumeFace({ level, darkText }: VolumeFaceProps) {
    return (
        <div className={`${darkText ? "bg-black/5" : "bg-white/10"} relative isolate flex h-4.5 w-full items-center overflow-hidden rounded-full pl-1.5`}>
            <VolumeFill volume={{ level, showing: true }} darkText={darkText} />
            <SpeakerIcon level={level} color={darkText ? "black" : "white"} />
        </div>
    );
}

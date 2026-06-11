import { Mic } from "lucide-react";
import { useMicrophone } from "../../../hooks/useMicrophone";
import { useDarkText } from "../../themeContext";

export default function MicrophoneStatus() {
    const darkText = useDarkText();
    const mic = useMicrophone();

    if (!mic.active) return null;

    const label = mic.apps.length > 0 ? mic.apps.map(a => a.replace(/\.exe$/i, "")).join(", ") : "In use";

    return (
        <div className={`flex items-center h-4.5 gap-2 ${darkText ? "bg-orange-800/80" : "bg-orange-900"} px-2 max-w-50 rounded-full text-[12px] leading-none text-white transition-colors duration-300`}>
            <Mic size={13} className="shrink-0" />
            <span className="truncate">
                {label}
            </span>
        </div>
    );
}

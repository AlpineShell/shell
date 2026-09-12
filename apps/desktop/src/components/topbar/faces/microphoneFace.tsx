import { Mic } from "lucide-react";

export default function MicrophoneFace({ label, darkText }: MicrophoneFaceProps) {
    return (
        <div className={`flex items-center h-4.5 gap-2 ${darkText ? "bg-orange-800/80" : "bg-orange-900"} px-2 max-w-50 rounded-full text-[12px] leading-none text-white transition-colors duration-300`}>
            <Mic size={13} className="shrink-0" />
            <span className="truncate">
                {label}
            </span>
        </div>
    );
}

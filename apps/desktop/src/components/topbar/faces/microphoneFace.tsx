import { Mic } from "lucide-react";

const UNNAMED_APPS_LABEL = "In use";

function microphoneLabel(apps: string[]): string {
    return apps.length > 0 ? apps.join(", ") : UNNAMED_APPS_LABEL;
}

export default function MicrophoneFace({ apps, darkText }: MicrophoneFaceProps) {
    return (
        <div className={`flex items-center h-4.5 gap-2 ${darkText ? "bg-orange-800/80" : "bg-orange-900"} px-2 max-w-50 rounded-full text-[12px] leading-none text-white transition-colors duration-300`}>
            <Mic size={13} className="shrink-0" />
            <span className="truncate">
                {microphoneLabel(apps)}
            </span>
        </div>
    );
}

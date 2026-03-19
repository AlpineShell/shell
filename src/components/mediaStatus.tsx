import { AudioLines } from "lucide-react";
import { useMediaSession } from "../hooks/useMediaSession";
import { useDarkText } from "./themeContext";

export default function MediaStatus() {
    const darkText = useDarkText();
    const media = useMediaSession();

    if (!media.playing || !media.title) return null;

    const label = media.artist ? `${media.title} - ${media.artist}` : media.title;

    return (
        <div className={`flex items-center h-4.5 gap-2 ${darkText ? "bg-green-600/20" : "bg-green-900"} px-2 max-w-50 rounded-full text-[12px] leading-none ${darkText ? "text-black" : "text-white"} transition-colors duration-300`}>
            <AudioLines size={13} className="shrink-0" />
            <span className="truncate">
                {label}
            </span>
        </div>
    );
}

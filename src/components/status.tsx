import { AudioLines } from "lucide-react";
import { useMediaSession } from "../hooks/useMediaSession";
import { useDarkText } from "./themeContext";

export default function Status() {
    const darkText = useDarkText();
    const media = useMediaSession();

    if (!media.playing || !media.title) return null;

    const label = media.artist ? `${media.title} - ${media.artist}` : media.title;

    return (
        <div className={`flex items-center gap-2 ${darkText ? "bg-green-600/20" : "bg-green-500/20"} px-2 max-w-50 rounded-full text-[12px] ${darkText ? "text-black" : "text-white"} transition-colors duration-300`}>
            <AudioLines size={10} className="shrink-0" />
            <span className="truncate">
                {label}
            </span>
        </div>
    );
}

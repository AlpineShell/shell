import { AudioLines } from "lucide-react";
import { useMediaSession } from "../../../hooks/useMediaSession";
import { useDarkText } from "../../themeContext";
import PopupMenu from "../shared/popupMenu";
import MediaMenu from "./mediaMenu";

export default function MediaStatus() {
    const darkText = useDarkText();
    const media = useMediaSession();

    if (!media.title) return null;

    const label = media.artist ? `${media.title} - ${media.artist}` : media.title;

    return (
        <PopupMenu
            align="right"
            onOpen={() => window.shell.media.session().then(media.update)}
            trigger={
                <div className={`flex items-center h-4.5 gap-2 ${media.playing ? (darkText ? "bg-green-800/80" : "bg-green-900") : (darkText ? "bg-black/10" : "bg-white/10")} px-2 max-w-50 rounded-full text-[12px] leading-none ${media.playing ? "text-white" : (darkText ? "text-black/70" : "text-white/70")} transition-colors duration-300`}>
                    <AudioLines size={13} className="shrink-0" />
                    <span className="truncate">
                        {label}
                    </span>
                </div>
            }
        >
            <MediaMenu media={media} darkText={darkText} />
        </PopupMenu>
    );
}

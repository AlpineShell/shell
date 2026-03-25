import { AudioLines } from "lucide-react";
import { useAudioPeak } from "../../../hooks/useAudioPeak";
import { useMediaSession } from "../../../hooks/useMediaSession";
import { useDarkText } from "../../themeContext";
import PopupMenu from "../shared/popupMenu";
import MediaMenu from "./mediaMenu";

const BAR_BASES = [0.3, 0.7, 0.5, 0.9, 0.4];
const BAR_OFFSETS = [0.6, 0.3, 0.5, 0.2, 0.7];
const MIN_H = 2;
const MAX_H = 11;

function MusicBars({ peak }: { peak: number }) {
    return (
        <span className="flex items-center gap-px shrink-0" style={{ width: 13, height: 13 }}>
            {BAR_BASES.map((base, i) => {
                const t = Math.min(1, peak * 1.5 + BAR_OFFSETS[i] * peak);
                const h = MIN_H + (MAX_H - MIN_H) * base * t;
                return (
                    <span
                        key={i}
                        className="w-px rounded-full bg-white"
                        style={{ height: h, transition: 'height 80ms linear' }}
                    />
                );
            })}
        </span>
    );
}

export default function MediaStatus() {
    const darkText = useDarkText();
    const media = useMediaSession();
    const peak = useAudioPeak(media.playing);

    if (!media.title) return null;

    const label = media.artist ? `${media.title} - ${media.artist}` : media.title;

    return (
        <PopupMenu
            align="right"
            onOpen={() => window.shell.media.session().then(media.update)}
            trigger={
                <div className={`flex items-center h-4.5 gap-1.5 ${darkText ? "bg-green-800/80" : "bg-green-900"} px-2 max-w-50 rounded-full text-[12px] leading-none text-white`}>
                    {media.playing
                        ? <MusicBars peak={peak} />
                        : <AudioLines size={13} className="shrink-0" />
                    }
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

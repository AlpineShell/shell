import { AudioLines } from "lucide-react";
import { useAudioPeak } from "../../../hooks/useAudioPeak";
import { useMediaSession } from "../../../hooks/useMediaSession";
import { useDarkText } from "../../themeContext";
import PopupMenu from "../shared/popupMenu";
import MediaMenu from "./mediaMenu";

const BAR_BASES = [0.4, 0.8, 0.55, 1.0, 0.5];
const BAR_OFFSETS = [0.15, 0.05, 0.1, 0.0, 0.12];
const MIN_H = 2;
const MAX_H = 13;

function MusicBars({ peak }: { peak: number }) {
    const boosted = Math.min(1, Math.sqrt(peak) * 1.8);
    return (
        <svg width={13} height={13} viewBox="0 0 13 13" className="shrink-0">
            {BAR_BASES.map((base, i) => {
                const t = Math.min(1, boosted + BAR_OFFSETS[i]);
                const h = Math.max(3, MIN_H + (MAX_H - MIN_H) * base * t);
                const x = 1 + i * 2.5;
                return (
                    <rect
                        key={i}
                        x={x}
                        y={(13 - h) / 2}
                        width={1.5}
                        height={h}
                        rx={0.5}
                        fill="white"
                        style={{ transition: 'y 80ms linear, height 80ms linear' }}
                    />
                );
            })}
        </svg>
    );
}

export default function MediaStatus() {
    const darkText = useDarkText();
    const media = useMediaSession();
    const peak = useAudioPeak(media.playing);

    if (!media.title) return null;

    return (
        <PopupMenu
            align="right"
            onOpen={() => window.shell.media.session().then(media.update)}
            trigger={
                <div className={`flex items-center gap-1.5 h-4.5 px-1.5 rounded-full ${darkText ? "hover:bg-black/5" : "hover:bg-white/10"} transition-colors`}>
                    {media.thumbnail ? (
                        <img
                            src={`data:${media.thumbnailType ?? "image/jpeg"};base64,${media.thumbnail}`}
                            className="w-3.5 h-3.5 rounded-[3px] object-cover shrink-0"
                            draggable={false}
                        />
                    ) : media.playing ? (
                        <MusicBars peak={peak} />
                    ) : (
                        <AudioLines size={13} color={darkText ? "black" : "white"} className="shrink-0" />
                    )}
                    {media.appName && (
                        <span className={`text-[12px] leading-none ${darkText ? "text-black" : "text-white"}`}>
                            {media.appName}
                        </span>
                    )}
                </div>
            }
        >
            <MediaMenu media={media} darkText={darkText} />
        </PopupMenu>
    );
}

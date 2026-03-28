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
        <svg width={14} height={14} viewBox="0 0 13 13" className="shrink-0">
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
            onOpen={() => window.shell.media.session().then(media.update)}
            trigger={
                <div className={`${darkText ? "bg-black/5" : "bg-white/10"} flex px-2 rounded-full h-4.5 items-center gap-1.5`}>
                    <MusicBars peak={peak} />
                    <span className={`text-[12px] leading-none max-w-24 truncate ${darkText ? "text-black" : "text-white"}`}>
                        {media.title}
                    </span>
                </div>
            }
        >
            <MediaMenu media={media} darkText={darkText} />
        </PopupMenu>
    );
}

import type { CSSProperties } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import MediaCover from "./mediaCover";

type MediaAction = 'toggle' | 'next' | 'previous';

interface MediaMenuProps {
    media: MediaPlayback & { control: (action: MediaAction) => void };
    darkText: boolean;
}

function coverSource(media: MediaPlayback) {
    if (!media.thumbnail) return null;
    return `data:${media.thumbnailType ?? "image/jpeg"};base64,${media.thumbnail}`;
}

function legibleOnCover(darkText: boolean): { text: CSSProperties; icons: CSSProperties } {
    const halo = darkText ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)";
    return {
        text: { textShadow: `0 1px 3px ${halo}, 0 0 8px ${halo}` },
        icons: { filter: `drop-shadow(0 1px 2px ${halo})` },
    };
}

function MediaControls({ media, color, style }: { media: MediaMenuProps["media"]; color: string; style?: CSSProperties }) {
    return (
        <div className="flex items-center justify-center gap-7" style={style}>
            <button aria-label="Previous" onClick={() => media.control('previous')} className="cursor-pointer">
                <SkipBack color={color} size={16} fill={color} />
            </button>
            <button aria-label={media.playing ? "Pause" : "Play"} onClick={() => media.control('toggle')} className="cursor-pointer">
                {media.playing
                    ? <Pause color={color} size={20} fill={color} />
                    : <Play color={color} size={20} fill={color} />
                }
            </button>
            <button aria-label="Next" onClick={() => media.control('next')} className="cursor-pointer">
                <SkipForward color={color} size={16} fill={color} />
            </button>
        </div>
    );
}

export default function MediaMenu({ media, darkText }: MediaMenuProps) {
    const cover = coverSource(media);
    const color = darkText ? "black" : "white";
    const legible = cover ? legibleOnCover(darkText) : null;

    return (
        <div className="relative w-80">
            {cover && <MediaCover src={cover} />}
            <div className="relative px-4 pt-2.5 pb-3.5 flex flex-col gap-3">
                <div className="flex flex-col min-w-0" style={legible?.text}>
                    <span className={`text-[13px] font-semibold truncate ${darkText ? "text-black" : "text-white"}`}>
                        {media.title ?? "Unknown"}
                    </span>
                    <span className={`text-[12px] font-medium truncate ${darkText ? "text-black/70" : "text-white/75"}`}>
                        {media.artist ?? "Unknown Artist"}
                    </span>
                </div>
                <MediaControls media={media} color={color} style={legible?.icons} />
            </div>
        </div>
    );
}

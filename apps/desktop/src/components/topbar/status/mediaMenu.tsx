import { useRef, type ComponentType, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import { SkipBackIcon } from "../../icons/skipBackIcon";
import { SkipForwardIcon } from "../../icons/skipForwardIcon";
import MediaCover from "./mediaCover";
import MediaProgress from "./mediaProgress";

type MediaAction = 'toggle' | 'next' | 'previous';

interface MediaMenuProps {
    media: MediaPlayback & { control: (action: MediaAction) => void };
    timeline: MediaTimeline | null;
    onSeek: (positionMs: number) => Promise<boolean>;
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

interface ControlButtonProps {
    label: string;
    Icon: ComponentType<AnimatedIconProps>;
    size: number;
    onPress: () => void;
}

function ControlButton({ label, Icon, size, onPress }: ControlButtonProps) {
    const iconRef = useRef<AnimatedIconHandle>(null);
    return (
        <button
            aria-label={label}
            onClick={() => {
                iconRef.current?.startAnimation();
                onPress();
            }}
            className="cursor-pointer"
        >
            <Icon ref={iconRef} size={size} />
        </button>
    );
}

function MediaControls({ media, darkText, style }: { media: MediaMenuProps["media"]; darkText: boolean; style?: CSSProperties }) {
    return (
        <div className={`flex items-center justify-center gap-7 ${darkText ? "text-black" : "text-white"}`} style={style}>
            <ControlButton label="Previous" Icon={SkipBackIcon} size={18} onPress={() => media.control('previous')} />
            <button aria-label={media.playing ? "Pause" : "Play"} onClick={() => media.control('toggle')} className="cursor-pointer">
                {media.playing ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <ControlButton label="Next" Icon={SkipForwardIcon} size={18} onPress={() => media.control('next')} />
        </div>
    );
}

export default function MediaMenu({ media, timeline, onSeek, darkText }: MediaMenuProps) {
    const cover = coverSource(media);
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
                {timeline && <MediaProgress timeline={timeline} darkText={darkText} onSeek={onSeek} textStyle={legible?.text} barStyle={legible?.icons} />}
                <MediaControls media={media} darkText={darkText} style={legible?.icons} />
            </div>
        </div>
    );
}

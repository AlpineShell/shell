import { Pause, Play, SkipBack, SkipForward, AudioLines } from "lucide-react";

interface MediaMenuProps {
    media: MediaPlayback & { control: (action: 'toggle' | 'next' | 'previous') => void };
    darkText: boolean;
}

export default function MediaMenu({ media, darkText }: MediaMenuProps) {
    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)";

    return (
        <div className="w-80 p-2 flex justify-between items-center gap-3">
            <div className="flex gap-3 items-center min-w-0 overflow-hidden">
                {media.thumbnail ? (
                    <img
                        src={`data:${media.thumbnailType ?? "image/jpeg"};base64,${media.thumbnail}`}
                        alt=""
                        className="w-11 h-11 rounded-md object-cover shrink-0"
                        draggable={false}
                    />
                ) : (
                    <div className={`w-11 h-11 rounded-md shrink-0 flex items-center justify-center ${darkText ? "bg-black/10" : "bg-white/10"}`}>
                        <AudioLines color={dimColor} size={20} />
                    </div>
                )}
                <div className="flex flex-col min-w-0">
                    <span className={`text-[13px] font-medium truncate ${darkText ? "text-black" : "text-white"}`}>
                        {media.title ?? "Unknown"}
                    </span>
                    <span className={`text-[12px] truncate ${darkText ? "text-black/50" : "text-white/50"}`}>
                        {media.artist ?? "Unknown Artist"}
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-center gap-5 mr-2 shrink-0">
                <button onClick={() => media.control('previous')} className="cursor-pointer">
                    <SkipBack color={color} size={16} fill={color} />
                </button>
                <button onClick={() => media.control('next')} className="cursor-pointer">
                    <SkipForward color={color} size={16} fill={color} />
                </button>
                <button
                    onClick={() => media.control('toggle')}
                    className={`cursor-pointer ml-1 rounded-full flex items-center justify-center transition-colors`}
                >
                    {media.playing
                        ? <Pause color={color} size={16} fill={color} />
                        : <Play color={color} size={16} fill={color} />
                    }
                </button>
            </div>
        </div>
    );
}

import VolumeFill from "./volumeFill";

const BAR_BASES = [0.4, 0.8, 0.55, 1.0, 0.5];
const BAR_OFFSETS = [0.15, 0.05, 0.1, 0.0, 0.12];
const MIN_H = 2;
const MAX_H = 13;
const NOISE_FLOOR = 0.05;

function boostedPeak(peak: number) {
    const gated = peak < NOISE_FLOOR ? 0 : (peak - NOISE_FLOOR) / (1 - NOISE_FLOOR);
    return Math.min(1, Math.pow(gated, 0.7) * 1.4);
}

function barHeight(index: number, boosted: number) {
    const t = boosted > 0 ? Math.min(1, boosted + BAR_OFFSETS[index] * boosted) : 0;
    return MIN_H + (MAX_H - MIN_H) * BAR_BASES[index] * t;
}

export function MusicBarsGlyph({ peak, color }: MusicBarsGlyphProps) {
    const boosted = boostedPeak(peak);
    return (
        <svg width={14} height={14} viewBox="0 0 13 13" className="shrink-0">
            {BAR_BASES.map((_, i) => {
                const h = barHeight(i, boosted);
                return (
                    <rect
                        key={i}
                        x={1 + i * 2.5}
                        y={(13 - h) / 2}
                        width={1.5}
                        height={h}
                        rx={0.5}
                        fill={color}
                        style={{ transition: "y 120ms linear, height 120ms linear" }}
                    />
                );
            })}
        </svg>
    );
}

const QUIETEST_AUDIBLE_GAIN = 0.3;

function audiblePeak(peak: number, volume: MediaFaceVolume | undefined) {
    if (!volume) return peak;
    if (volume.level <= 0) return 0;
    return peak * (QUIETEST_AUDIBLE_GAIN + (1 - QUIETEST_AUDIBLE_GAIN) * Math.min(1, volume.level));
}

export default function MediaFace({ title, appIcon, peak, darkText, volume }: MediaFaceProps) {
    return (
        <div className={`${darkText ? "bg-black/5" : "bg-white/10"} relative isolate overflow-hidden flex ${appIcon ? "pl-0.5 pr-2" : "px-2"} rounded-full h-4.5 items-center gap-1.5`}>
            {volume && <VolumeFill volume={volume} darkText={darkText} />}
            {appIcon ? (
                <img src={`data:image/png;base64,${appIcon}`} alt="" className="w-3.5 h-3.5 shrink-0 rounded-[3px]" draggable={false} />
            ) : (
                <MusicBarsGlyph peak={audiblePeak(peak, volume)} color={darkText ? "black" : "white"} />
            )}
            <span className={`text-[12px] leading-none max-w-24 truncate ${darkText ? "text-black" : "text-white"}`}>
                {title}
            </span>
        </div>
    );
}

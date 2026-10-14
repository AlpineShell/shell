import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useNow } from "../../../hooks/useNow";
import { formatMediaTime, mediaElapsedMs, positionAtPointer } from "../../../lib/mediaProgress";

const TICK_MS = 250;
const KEY_STEP_MS = 5000;

type PendingSeek = { positionMs: number; at: number; base: number };

interface MediaProgressProps {
    timeline: MediaTimeline;
    darkText: boolean;
    onSeek?: (positionMs: number) => Promise<boolean>;
    textStyle?: CSSProperties;
    barStyle?: CSSProperties;
}

function keyboardTarget(key: string, elapsedMs: number, durationMs: number) {
    if (key === "Home") return 0;
    if (key === "End") return durationMs;
    if (key === "ArrowLeft") return Math.max(0, elapsedMs - KEY_STEP_MS);
    if (key === "ArrowRight") return Math.min(durationMs, elapsedMs + KEY_STEP_MS);
    return null;
}

export default function MediaProgress({ timeline, darkText, onSeek, textStyle, barStyle }: MediaProgressProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<number | null>(null);
    const [dragMs, setDragMs] = useState<number | null>(null);
    const [pending, setPending] = useState<PendingSeek | null>(null);
    const seekable = timeline.canSeek && !!onSeek;
    const shown = pending && pending.base === timeline.updatedAt
        ? { ...timeline, positionMs: pending.positionMs, updatedAt: pending.at }
        : timeline;
    const now = useNow(shown.playing && dragMs === null, TICK_MS);
    const elapsedMs = dragMs ?? mediaElapsedMs(shown, now);
    const percent = (elapsedMs / timeline.durationMs) * 100;
    const timeClass = `text-[11px] font-medium tabular-nums shrink-0 ${darkText ? "text-black/60" : "text-white/70"}`;
    const thickness = seekable
        ? "h-1 group-hover:h-2 group-focus-visible:h-2 group-data-[dragging=true]:h-2"
        : "h-1";

    function positionUnder(clientX: number) {
        const rect = trackRef.current?.getBoundingClientRect();
        return rect ? positionAtPointer(clientX, rect.left, rect.width, timeline.durationMs) : elapsedMs;
    }

    function preview(positionMs: number) {
        dragRef.current = positionMs;
        setDragMs(positionMs);
    }

    function commit(positionMs: number) {
        dragRef.current = null;
        setDragMs(null);
        if (!onSeek) return;
        setPending({ positionMs, at: Date.now(), base: timeline.updatedAt });
        onSeek(positionMs).then((success) => {
            if (!success) setPending(null);
        });
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!seekable) return;
        const target = keyboardTarget(event.key, elapsedMs, timeline.durationMs);
        if (target === null) return;
        event.preventDefault();
        commit(target);
    }

    return (
        <div className="flex items-center gap-2.5">
            <span className={timeClass} style={textStyle}>{formatMediaTime(elapsedMs)}</span>
            <div
                role={seekable ? "slider" : "progressbar"}
                aria-label="Playback"
                aria-valuemin={0}
                aria-valuemax={Math.round(timeline.durationMs / 1000)}
                aria-valuenow={Math.round(elapsedMs / 1000)}
                aria-valuetext={`${formatMediaTime(elapsedMs)} of ${formatMediaTime(timeline.durationMs)}`}
                tabIndex={seekable ? 0 : undefined}
                data-dragging={dragMs !== null}
                className={`group flex h-3 flex-1 items-center outline-none ${seekable ? "cursor-pointer" : ""}`}
                onPointerDown={(event) => {
                    if (!seekable || event.button !== 0) return;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    preview(positionUnder(event.clientX));
                }}
                onPointerMove={(event) => {
                    if (dragRef.current !== null) preview(positionUnder(event.clientX));
                }}
                onPointerUp={(event) => {
                    if (dragRef.current !== null) commit(positionUnder(event.clientX));
                }}
                onLostPointerCapture={() => {
                    if (dragRef.current !== null) commit(dragRef.current);
                }}
                onKeyDown={handleKeyDown}
            >
                <div
                    ref={trackRef}
                    className={`relative w-full overflow-hidden rounded-full transition-[height] duration-150 ${thickness} ${darkText ? "bg-black/15" : "bg-white/25"}`}
                    style={barStyle}
                >
                    <div
                        className={`absolute inset-y-0 left-0 ${darkText ? "bg-black/80" : "bg-white"}`}
                        style={{ width: `${percent}%`, transition: dragMs === null ? `width ${TICK_MS}ms linear` : "none" }}
                    />
                </div>
            </div>
            <span className={timeClass} style={textStyle}>{formatMediaTime(timeline.durationMs)}</span>
        </div>
    );
}

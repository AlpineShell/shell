import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { useDarkText } from "../themeContext";
import { useScreenshotSaved } from "../../hooks/useScreenshotSaved";
import { useSprings } from "../../hooks/useSprings";

const CHIP_START_PADDING = 2;
const THUMBNAIL_WIDTH = 24;
const STATUS_PILL_RADIUS = 9;
const CLUSTER_GAP = 4;
const CUTOUT_GAP = 2;
const CUTOUT_RADIUS = STATUS_PILL_RADIUS + CUTOUT_GAP;
const CHIP_END_PADDING = CUTOUT_RADIUS + CUTOUT_GAP;
const COLLAPSED_WIDTH = CHIP_START_PADDING + THUMBNAIL_WIDTH + CHIP_END_PADDING;
const HIDDEN_WIDTH = CHIP_END_PADDING;
const TUCK_UNDER_STATUS_PILL = CLUSTER_GAP + STATUS_PILL_RADIUS;
const FADE_SPAN = 8;
const STILL_POINTER_PX = 3;
const CUT_OUT_FOR_STATUS_PILL = {
    paddingRight: CHIP_END_PADDING,
    maskImage: `radial-gradient(circle at 100% 50%, transparent ${CUTOUT_RADIUS}px, #000 ${CUTOUT_RADIUS + 0.5}px)`,
};
const SHOWN_MS = 5000;
const LINGER_AFTER_HOVER_MS = 2000;

const unit = (value: number) => Math.min(1, Math.max(0, value));

function pointerStayedWhereItLeft(leftAt: { x: number; y: number } | null, event: PointerEvent<HTMLDivElement>) {
    if (!leftAt) return false;
    return Math.abs(event.clientX - leftAt.x) < STILL_POINTER_PX && Math.abs(event.clientY - leftAt.y) < STILL_POINTER_PX;
}

function chipFrameStyle(box: number) {
    return {
        width: `${box}px`,
        marginRight: `${-(TUCK_UNDER_STATUS_PILL + Math.max(0, HIDDEN_WIDTH + CLUSTER_GAP - box))}px`,
        opacity: String(unit((box - HIDDEN_WIDTH) / FADE_SPAN)),
    };
}

function openWidthOf(label: HTMLElement | null) {
    return COLLAPSED_WIDTH + (label ? Math.ceil(label.offsetWidth) : 0);
}

function ChipThumbnail({ thumbnail, darkText }: { thumbnail: string | null; darkText: boolean }) {
    const frame = "block h-3.5 w-6 shrink-0 rounded-full";
    if (!thumbnail) return <span className={`${frame} ${darkText ? "bg-black/20" : "bg-white/30"}`} />;
    return <img src={thumbnail} alt="" className={`${frame} object-cover`} draggable={false} />;
}

function SavedChip({ saved, onGone }: { saved: ScreenshotSaved; onGone: () => void }) {
    const darkText = useDarkText();
    const chipRef = useRef<HTMLDivElement>(null);
    const detailRef = useRef<HTMLSpanElement>(null);
    const labelRef = useRef<HTMLSpanElement>(null);
    const everHovered = useRef(false);
    const leftAt = useRef<{ x: number; y: number } | null>(null);
    const [visible, setVisible] = useState(true);
    const [hovered, setHovered] = useState(false);
    const [openWidth, setOpenWidth] = useState(COLLAPSED_WIDTH);

    useLayoutEffect(() => {
        setOpenWidth(openWidthOf(labelRef.current));
    }, []);

    useEffect(() => {
        if (hovered || !visible) return;
        const timer = setTimeout(() => setVisible(false), everHovered.current ? LINGER_AFTER_HOVER_MS : SHOWN_MS);
        return () => clearTimeout(timer);
    }, [hovered, visible]);

    const targetWidth = !visible ? HIDDEN_WIDTH : hovered ? openWidth : COLLAPSED_WIDTH;

    useSprings(
        [HIDDEN_WIDTH],
        [targetWidth],
        ([width]) => {
            const box = Math.max(HIDDEN_WIDTH, Math.round(width));
            const detailWidth = Math.max(0, box - COLLAPSED_WIDTH);
            if (chipRef.current) Object.assign(chipRef.current.style, chipFrameStyle(box));
            if (detailRef.current) {
                detailRef.current.style.maxWidth = `${detailWidth}px`;
                detailRef.current.style.opacity = String(unit(detailWidth / Math.max(1, openWidth - COLLAPSED_WIDTH)));
            }
        },
        () => {
            if (!visible) onGone();
        },
    );

    const startHover = (event: PointerEvent<HTMLDivElement>) => {
        if (!visible || hovered || pointerStayedWhereItLeft(leftAt.current, event)) return;
        everHovered.current = true;
        setOpenWidth(openWidthOf(labelRef.current));
        setHovered(true);
    };

    const endHover = (event: PointerEvent<HTMLDivElement>) => {
        if (!hovered) return;
        leftAt.current = { x: event.clientX, y: event.clientY };
        setHovered(false);
    };

    const revealInExplorer = () => {
        void window.screenshot.reveal(saved.id).catch(() => {});
        setHovered(false);
        setVisible(false);
    };

    return (
        <div
            ref={chipRef}
            role="status"
            style={{ ...CUT_OUT_FOR_STATUS_PILL, ...chipFrameStyle(HIDDEN_WIDTH) }}
            className={`pointer-events-none flex h-4.5 shrink-0 items-center justify-end overflow-hidden rounded-l-full text-[12px] ${
                darkText ? "bg-black/5 text-black/85" : "bg-white/10 text-white/90"
            }`}
        >
            <div
                onPointerEnter={startHover}
                onPointerMove={startHover}
                onPointerLeave={endHover}
                onClick={revealInExplorer}
                className="pointer-events-auto flex w-max shrink-0 cursor-pointer items-center whitespace-nowrap"
            >
                <ChipThumbnail thumbnail={saved.thumbnail} darkText={darkText} />
                <span ref={detailRef} style={{ maxWidth: 0, opacity: 0 }} className="block overflow-hidden">
                    <span ref={labelRef} className="block w-max pl-1.5 pr-1">
                        {saved.name}
                    </span>
                </span>
            </div>
        </div>
    );
}

export default function ScreenshotChip() {
    const signal = useScreenshotSaved();
    const [goneSequence, setGoneSequence] = useState(0);

    if (!signal || signal.sequence === goneSequence) return null;

    return <SavedChip key={signal.sequence} saved={signal.saved} onGone={() => setGoneSequence(signal.sequence)} />;
}

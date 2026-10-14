import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useOwnsChromeSurface } from "../../../hooks/useOwnsChromeSurface";
import { useRidgeBackdrop } from "../ridgeBackdrop";
import { coverBlurPx, MAX_COVER_BLUR } from "./mediaCoverSoftness";

const BAR_BOTTOM = 24;
const SIDE_FEATHER = 40;
const BOTTOM_BLEED = MAX_COVER_BLUR * 2;
const COVER_OPACITY = 0.55;
const FADE_MS = 300;
const COVER_MASK = [
    "linear-gradient(to bottom, transparent 0%, black 80%)",
    `linear-gradient(to right, transparent 0, black ${SIDE_FEATHER}px, black calc(100% - ${SIDE_FEATHER}px), transparent 100%)`,
].join(", ");

type CoverBox = { left: number; width: number; height: number };
type NaturalSize = { width: number; height: number };

function measureCover(frame: HTMLElement): CoverBox {
    const rect = frame.getBoundingClientRect();
    return { left: rect.left, width: rect.width, height: rect.height };
}

function sameBox(a: CoverBox | null, b: CoverBox) {
    return !!a && a.left === b.left && a.width === b.width && a.height === b.height;
}

function coverStyle(blur: number): CSSProperties {
    return {
        position: "absolute",
        maxWidth: "none",
        objectFit: "cover",
        maskImage: COVER_MASK,
        maskComposite: "intersect",
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
    };
}

export default function MediaCover({ src }: { src: string }) {
    const frameRef = useRef<HTMLDivElement>(null);
    const backdrop = useRidgeBackdrop();
    const open = useOwnsChromeSurface(frameRef);
    const [box, setBox] = useState<CoverBox | null>(null);
    const [natural, setNatural] = useState<NaturalSize | null>(null);

    useLayoutEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const next = measureCover(frame);
        setBox((current) => (sameBox(current, next) ? current : next));
    }, [open]);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const observer = new ResizeObserver(() => {
            const next = measureCover(frame);
            setBox((current) => (sameBox(current, next) ? current : next));
        });
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    const coverWidth = (box?.width ?? 0) + SIDE_FEATHER * 2;
    const coverHeight = BAR_BOTTOM + (box?.height ?? 0) + BOTTOM_BLEED;
    const blur = coverBlurPx(natural, { width: coverWidth, height: coverHeight }, window.devicePixelRatio || 1);
    const style = coverStyle(blur);

    return (
        <div ref={frameRef} className="absolute inset-0 pointer-events-none">
            <img
                src={src}
                alt=""
                draggable={false}
                className="select-none"
                onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                style={{
                    ...style,
                    left: -SIDE_FEATHER,
                    top: -BAR_BOTTOM,
                    width: `calc(100% + ${SIDE_FEATHER * 2}px)`,
                    height: `calc(100% + ${BAR_BOTTOM + BOTTOM_BLEED}px)`,
                    opacity: COVER_OPACITY,
                }}
            />
            {backdrop && box && createPortal(
                <img
                    src={src}
                    alt=""
                    draggable={false}
                    className="select-none"
                    style={{
                        ...style,
                        left: box.left - SIDE_FEATHER,
                        top: 0,
                        width: coverWidth,
                        height: coverHeight,
                        opacity: open ? COVER_OPACITY : 0,
                        transition: `opacity ${FADE_MS}ms ease`,
                    }}
                />,
                backdrop,
            )}
        </div>
    );
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useOwnedChromeSurface } from "../../../hooks/useOwnedChromeSurface";
import { useSurfaceSuperseded } from "../../../hooks/useSurfaceSuperseded";
import { counterTranslate } from "../chrome/counterTranslate";
import { setSurfaceBackdrop } from "../chrome/chromeStore";
import { useRidgeBackdrop } from "../ridgeBackdrop";
import { coverBlurPx, MAX_COVER_BLUR } from "./mediaCoverSoftness";

const BAR_BOTTOM = 24;
const SIDE_FEATHER = 40;
const BOTTOM_BLEED = MAX_COVER_BLUR * 2;
const COVER_OPACITY = 0.55;
const COVER_MASK = [
    "linear-gradient(to bottom, transparent 0%, black 80%)",
    `linear-gradient(to right, transparent 0, black ${SIDE_FEATHER}px, black calc(100% - ${SIDE_FEATHER}px), transparent 100%)`,
].join(", ");
const HIDDEN_UNTIL_DRAWN: CSSProperties = { opacity: 0, clipPath: "inset(100%)" };

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
        opacity: COVER_OPACITY,
    };
}

export default function MediaCover({ src }: { src: string }) {
    const frameRef = useRef<HTMLDivElement>(null);
    const coverRef = useRef<HTMLImageElement>(null);
    const [ridgeLayer, setRidgeLayer] = useState<HTMLDivElement | null>(null);
    const backdrop = useRidgeBackdrop();
    const { open, surface } = useOwnedChromeSurface(frameRef);
    const superseded = useSurfaceSuperseded(surface?.id ?? 0);
    const surfaceContent = surface?.contentEl ?? null;
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

    useEffect(() => {
        const cover = coverRef.current;
        if (!surfaceContent || !cover) return;
        const holdStill = () => {
            cover.style.setProperty("translate", counterTranslate(surfaceContent.style.getPropertyValue("translate")));
        };
        holdStill();
        const observer = new MutationObserver(holdStill);
        observer.observe(surfaceContent, { attributes: true, attributeFilter: ["style"] });
        return () => observer.disconnect();
    }, [surfaceContent]);

    useEffect(() => {
        if (!surfaceContent || !ridgeLayer) return;
        setSurfaceBackdrop(surfaceContent, ridgeLayer);
        return () => setSurfaceBackdrop(surfaceContent, null);
    }, [surfaceContent, ridgeLayer]);

    const coverWidth = (box?.width ?? 0) + SIDE_FEATHER * 2;
    const coverHeight = BAR_BOTTOM + (box?.height ?? 0) + BOTTOM_BLEED;
    const blur = coverBlurPx(natural, { width: coverWidth, height: coverHeight }, window.devicePixelRatio || 1);
    const style = coverStyle(blur);

    return (
        <div ref={frameRef} className="absolute inset-0 pointer-events-none">
            <img
                ref={coverRef}
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
                }}
            />
            {backdrop && box && surface && createPortal(
                <div
                    ref={setRidgeLayer}
                    style={{
                        ...HIDDEN_UNTIL_DRAWN,
                        position: "absolute",
                        left: box.left - SIDE_FEATHER,
                        top: 0,
                        width: coverWidth,
                        height: coverHeight,
                        visibility: superseded ? "hidden" : undefined,
                    }}
                >
                    <img
                        src={src}
                        alt=""
                        draggable={false}
                        className="select-none"
                        style={{ ...style, left: 0, top: 0, width: "100%", height: "100%" }}
                    />
                </div>,
                backdrop,
            )}
        </div>
    );
}

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useOwnedChromeSurface } from "../../../hooks/useOwnedChromeSurface";
import { useSurfaceSuperseded } from "../../../hooks/useSurfaceSuperseded";
import { setSurfaceBackdrop } from "../chrome/chromeStore";
import { useRidgeBackdrop } from "../ridgeBackdrop";
import { coverBlurPx, MAX_COVER_BLUR } from "./mediaCoverSoftness";

const BAR_BOTTOM = 24;
const SIDE_FEATHER = 40;
const BOTTOM_BLEED = MAX_COVER_BLUR * 2;
const COVER_OPACITY = 0.55;
const SURFACE_LAYER_Z = 1;
const COVER_MASK = [
    "linear-gradient(to bottom, transparent 0%, black 80%)",
    `linear-gradient(to right, transparent 0, black ${SIDE_FEATHER}px, black calc(100% - ${SIDE_FEATHER}px), transparent 100%)`,
].join(", ");
const LAYER_BOX: CSSProperties = {
    left: `calc(var(--chrome-left, 0px) - ${SIDE_FEATHER}px)`,
    top: 0,
    width: `calc(var(--chrome-width, 0px) + ${SIDE_FEATHER * 2}px)`,
    height: `calc(var(--chrome-bar, ${BAR_BOTTOM}px) + var(--chrome-height, 0px) + ${BOTTOM_BLEED}px)`,
    pointerEvents: "none",
    opacity: 0,
    clipPath: "inset(100%)",
};

type NaturalSize = { width: number; height: number };

function coverImageStyle(blur: number): CSSProperties {
    return {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        maxWidth: "none",
        objectFit: "cover",
        maskImage: COVER_MASK,
        maskComposite: "intersect",
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        opacity: COVER_OPACITY,
    };
}

export default function MediaCover({ src }: { src: string }) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const ridge = useRidgeBackdrop();
    const { surface } = useOwnedChromeSurface(anchorRef);
    const superseded = useSurfaceSuperseded(surface?.id ?? 0);
    const surfaceContent = surface?.contentEl ?? null;
    const [barLayer, setBarLayer] = useState<HTMLDivElement | null>(null);
    const [surfaceLayer, setSurfaceLayer] = useState<HTMLDivElement | null>(null);
    const [natural, setNatural] = useState<NaturalSize | null>(null);

    useEffect(() => {
        if (!surfaceContent) return;
        setSurfaceBackdrop(surfaceContent, { bar: barLayer, surface: surfaceLayer });
        return () => setSurfaceBackdrop(surfaceContent, null);
    }, [surfaceContent, barLayer, surfaceLayer]);

    const coverSize = {
        width: (surface?.bodyWidth ?? 0) + SIDE_FEATHER * 2,
        height: BAR_BOTTOM + (surface?.fullHeight ?? 0) + BOTTOM_BLEED,
    };
    const imageStyle = coverImageStyle(coverBlurPx(natural, coverSize, window.devicePixelRatio || 1));
    const visibility = superseded ? "hidden" : undefined;

    return (
        <>
            <span ref={anchorRef} hidden />
            {surface && ridge && createPortal(
                <div ref={setBarLayer} style={{ ...LAYER_BOX, position: "absolute", visibility }}>
                    <img src={src} alt="" draggable={false} className="select-none" style={imageStyle} />
                </div>,
                ridge,
            )}
            {surface && createPortal(
                <div ref={setSurfaceLayer} style={{ ...LAYER_BOX, position: "fixed", zIndex: SURFACE_LAYER_Z, visibility }}>
                    <img
                        src={src}
                        alt=""
                        draggable={false}
                        className="select-none"
                        style={imageStyle}
                        onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                    />
                </div>,
                document.body,
            )}
        </>
    );
}

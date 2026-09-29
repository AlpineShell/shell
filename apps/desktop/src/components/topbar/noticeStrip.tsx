import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDarkText } from "../themeContext";
import { useSurfaceSuperseded } from "../../hooks/useSurfaceSuperseded";
import { useShellNotice } from "../../hooks/useShellNotice";
import { SHOULDER, RADIUS, chromeSurfaceBounds, type ChromeAnchor } from "./chrome/chromeShape";
import { setChromeSurface, clearChromeSurface, getChromeSurface, nextSurfaceId } from "./chrome/chromeStore";

const BAR_BOTTOM = 24;
const SCREEN_PAD = 6;
const CLOSE_MS = 300;
const MAX_BODY_WIDTH = 440;

type Shape = { centerX: number; bodyWidth: number; bodyHeight: number; left: number; anchor: ChromeAnchor };

function Spinner({ darkText }: { darkText: boolean }) {
    return (
        <span
            className={`block size-3 shrink-0 rounded-full border-[1.5px] animate-spin ${
                darkText ? "border-black/15 border-t-black/60" : "border-white/25 border-t-white/80"
            }`}
        />
    );
}

function accentClass(tone: ShellNoticeTone, darkText: boolean) {
    if (tone === "success") return "bg-emerald-500";
    if (tone === "error") return "bg-rose-500";
    return darkText ? "bg-black/30" : "bg-white/45";
}

export default function NoticeStrip() {
    const darkText = useDarkText();

    const live = useShellNotice();
    const [notice, setNotice] = useState<ShellNotice | null>(null);
    const [shape, setShape] = useState<Shape | null>(null);

    const clipRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const idRef = useRef(0);
    if (!idRef.current) idRef.current = nextSurfaceId();
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const holdsRegion = useRef(false);

    const superseded = useSurfaceSuperseded(idRef.current);

    function releaseRegion() {
        if (!holdsRegion.current) return;
        holdsRegion.current = false;
        window.topbar.setActiveRegion(null);
    }

    useEffect(() => {
        if (live && !live.pill) {
            clearTimeout(closeTimer.current);
            setNotice(live);
            setShape(null);
            return;
        }
        clearChromeSurface(idRef.current);
        releaseRegion();
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            setNotice(null);
            setShape(null);
        }, CLOSE_MS);
    }, [live]);

    function measureShape(): Shape | null {
        const body = bodyRef.current;
        if (!body) return null;
        body.style.width = "max-content";
        const bodyWidth = Math.ceil(body.getBoundingClientRect().width);
        body.style.width = `${bodyWidth}px`;
        const bodyHeight = Math.ceil(body.getBoundingClientRect().height);
        const screenW = window.innerWidth;
        const half = bodyWidth / 2;
        let anchor: ChromeAnchor = "center";
        let centerX = Math.round(screenW / 2);
        if (centerX - half - SHOULDER < SCREEN_PAD) {
            anchor = "left";
            centerX = Math.round(half);
        } else if (centerX + half + SHOULDER > screenW - SCREEN_PAD) {
            anchor = "right";
            centerX = Math.round(screenW - half);
        }
        return { centerX, bodyWidth, bodyHeight, left: centerX - bodyWidth / 2, anchor };
    }

    useLayoutEffect(() => {
        if (!notice || shape) return;
        const next = measureShape();
        if (next) setShape(next);
    }, [notice, shape]);

    useLayoutEffect(() => {
        if (!notice || !shape) return;
        if (superseded) {
            releaseRegion();
            return;
        }
        const alreadyOurs = getChromeSurface()?.id === idRef.current;
        if (clipRef.current && !alreadyOurs) {
            clipRef.current.style.height = `${shape.bodyHeight}px`;
            clipRef.current.style.clipPath = `inset(0 0 ${shape.bodyHeight}px 0 round 0 0 ${RADIUS}px ${RADIUS}px)`;
        }
        setChromeSurface({
            id: idRef.current,
            centerX: shape.centerX,
            bodyWidth: shape.bodyWidth,
            fullHeight: shape.bodyHeight,
            anchor: shape.anchor,
            contentEl: clipRef.current,
        });
        holdsRegion.current = true;
        window.topbar.setActiveRegion(chromeSurfaceBounds({
            centerX: shape.centerX,
            bodyWidth: shape.bodyWidth,
            height: shape.bodyHeight,
            barBottom: BAR_BOTTOM,
            anchor: shape.anchor,
        }));
    }, [notice, shape, superseded]);

    useEffect(() => {
        if (!notice || !shape) return;
        const body = bodyRef.current;
        if (!body) return;
        const observer = new ResizeObserver(() => {
            const next = measureShape();
            if (!next) return;
            if (Math.abs(next.bodyHeight - shape.bodyHeight) < 1 && Math.abs(next.bodyWidth - shape.bodyWidth) < 1) return;
            setShape(next);
        });
        observer.observe(body);
        return () => observer.disconnect();
    }, [notice, shape]);

    useEffect(
        () => () => {
            clearTimeout(closeTimer.current);
            clearChromeSurface(idRef.current);
            releaseRegion();
        },
        [],
    );

    if (!notice) return null;

    const interactive = !superseded && Boolean(shape);
    const titleClass = darkText ? "text-black/90" : "text-white/95";
    const messageClass = darkText ? "text-black/60" : "text-white/70";
    const quietButton = darkText
        ? "text-black/55 hover:bg-black/5 hover:text-black/85"
        : "text-white/60 hover:bg-white/10 hover:text-white/90";
    const strongButton = darkText
        ? "bg-black/10 text-black/90 hover:bg-black/15"
        : "bg-white/15 text-white hover:bg-white/25";

    return createPortal(
        <div
            ref={clipRef}
            style={{
                position: "fixed",
                left: shape ? shape.left : -9999,
                top: BAR_BOTTOM,
                width: shape ? shape.bodyWidth : undefined,
                zIndex: 5,
                pointerEvents: interactive ? "auto" : "none",
                visibility: superseded ? "hidden" : undefined,
                willChange: "clip-path",
            }}
        >
            <div
                ref={bodyRef}
                style={{ maxWidth: MAX_BODY_WIDTH }}
                className="flex items-start gap-2.5 px-3.5 py-2.5"
            >
                {notice.busy ? (
                    <span className="mt-0.5">
                        <Spinner darkText={darkText} />
                    </span>
                ) : (
                    <span className={`mt-1.5 block size-2 shrink-0 rounded-full ${accentClass(notice.tone, darkText)}`} />
                )}
                <div className="min-w-0 flex-1">
                    {notice.title && <div className={`text-[12px] font-medium leading-4 ${titleClass}`}>{notice.title}</div>}
                    <div className={`text-[12px] leading-4 ${messageClass}`}>{notice.message}</div>
                    {notice.confirm && (
                        <div className="mt-2 flex justify-end gap-1.5">
                            <button
                                type="button"
                                className={`rounded-md px-2 py-1 text-[11px] leading-4 ${quietButton}`}
                                onClick={() => window.notice.dismiss(notice.id)}
                            >
                                {notice.confirm.cancelLabel}
                            </button>
                            <button
                                type="button"
                                className={`rounded-md px-2.5 py-1 text-[11px] font-medium leading-4 ${strongButton}`}
                                onClick={() => window.notice.confirm(notice.id)}
                            >
                                {notice.confirm.label}
                            </button>
                        </div>
                    )}
                    {notice.action && !notice.confirm && (
                        <button
                            type="button"
                            className={`mt-2 rounded-md px-2 py-1 text-[11px] leading-4 ${strongButton}`}
                            onClick={() => window.notice.runAction(notice.id)}
                        >
                            {notice.action.label}
                        </button>
                    )}
                </div>
                {!notice.busy && !notice.confirm && (
                    <button
                        type="button"
                        aria-label="Dismiss"
                        className={`-mr-1 -mt-0.5 rounded-md px-1.5 py-0.5 text-[13px] leading-4 ${quietButton}`}
                        onClick={() => window.notice.dismiss(notice.id)}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>,
        document.body,
    );
}

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTopbarBg, useFullscreenWindow } from "../../themeContext";
import { useSurfaceSuperseded } from "../../../hooks/useSurfaceSuperseded";
import { SHOULDER, RADIUS, type ChromeAnchor } from "../chrome/chromeShape";
import { setChromeSurface, clearChromeSurface, nextSurfaceId } from "../chrome/chromeStore";

const SCREEN_PAD = 6;
const EDGE_PAD = 0;
const BAR_BOTTOM = 24;
const CLOSE_MS = 300;
const REGION_SHRINK_DELAY_MS = 260;

type Shape = { centerX: number; bodyWidth: number; bodyHeight: number; left: number; anchor: ChromeAnchor };

let activeMenu: { close: () => void } | null = null;

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    onOpen?: () => void;
}

export default function PopupMenu({ trigger, children, onOpen }: PopupMenuProps) {
    const BG = useTopbarBg();
    const outline = useFullscreenWindow();

    const wrapperRef = useRef<HTMLDivElement>(null);
    const clipRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const [open, setOpen] = useState(false);
    const [shape, setShape] = useState<Shape | null>(null);

    const idRef = useRef(0);
    if (!idRef.current) idRef.current = nextSurfaceId();
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const suppressReset = useRef(false);
    const regionBottomRef = useRef(0);
    const shrinkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pendingClose = useRef(false);

    const superseded = useSurfaceSuperseded(idRef.current);

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    const selfRef = useRef<{ close: () => void } | null>(null);
    if (!selfRef.current) {
        selfRef.current = {
            close: () => {
                clearTimeout(closeTimer.current);
                clearTimeout(shrinkTimer.current);
                regionBottomRef.current = 0;
                suppressReset.current = true;
                setOpen(false);
                setShape(null);
            },
        };
    }

    useEffect(() => {
        if (open) onOpenRef.current?.();
    }, [open]);

    function measureShape(): Shape | null {
        const wrapper = wrapperRef.current;
        const body = bodyRef.current;
        if (!wrapper || !body) return null;
        body.style.width = "max-content";
        const rect = body.getBoundingClientRect();
        const bodyWidth = Math.round(rect.width);
        const bodyHeight = Math.round(rect.height);
        body.style.width = `${bodyWidth}px`;
        const triggerRect = wrapper.getBoundingClientRect();
        const center = triggerRect.left + triggerRect.width / 2;
        const screenW = window.innerWidth;
        const half = bodyWidth / 2;
        let anchor: ChromeAnchor = "center";
        let centerX = Math.round(center);
        if (center - half - SHOULDER < SCREEN_PAD) {
            if (triggerRect.left <= EDGE_PAD + SHOULDER) {
                anchor = "left";
                centerX = Math.round(EDGE_PAD + half);
            } else {
                const maxLeft = Math.max(EDGE_PAD + SHOULDER, screenW - SCREEN_PAD - SHOULDER - bodyWidth);
                const alignedLeft = Math.min(triggerRect.left, maxLeft);
                centerX = Math.round(alignedLeft + half);
            }
        } else if (center + half + SHOULDER > screenW - SCREEN_PAD) {
            anchor = "right";
            centerX = Math.round(screenW - EDGE_PAD - half);
        }
        return { centerX, bodyWidth, bodyHeight, left: centerX - bodyWidth / 2, anchor };
    }

    useLayoutEffect(() => {
        if (!open || shape) return;
        const next = measureShape();
        if (next) setShape(next);
    }, [open, shape]);

    useLayoutEffect(() => {
        if (!open || !shape) return;
        if (clipRef.current) {
            clipRef.current.style.height = `${shape.bodyHeight}px`;
            clipRef.current.style.clipPath = `inset(0 0 ${shape.bodyHeight}px 0 round 0 0 ${RADIUS}px ${RADIUS}px)`;
        }
        setChromeSurface({
            id: idRef.current,
            centerX: shape.centerX,
            bodyWidth: shape.bodyWidth,
            fullHeight: shape.bodyHeight,
            outline,
            anchor: shape.anchor,
            contentEl: clipRef.current,
        });
        const sideL = shape.anchor === "left" ? 0 : SHOULDER;
        const sideR = shape.anchor === "right" ? 0 : SHOULDER;
        const left = shape.left - sideL;
        const right = shape.left + shape.bodyWidth + sideR;
        const targetBottom = BAR_BOTTOM + shape.bodyHeight;
        clearTimeout(shrinkTimer.current);
        const reportedBottom = Math.max(targetBottom, regionBottomRef.current);
        regionBottomRef.current = reportedBottom;
        window.topbar.setActiveRegion({ top: BAR_BOTTOM, bottom: reportedBottom, left, right });
        if (targetBottom < reportedBottom) {
            shrinkTimer.current = setTimeout(() => {
                regionBottomRef.current = targetBottom;
                window.topbar.setActiveRegion({ top: BAR_BOTTOM, bottom: targetBottom, left, right });
            }, REGION_SHRINK_DELAY_MS);
        }
    }, [open, shape, outline]);

    useEffect(() => {
        if (!open || !shape) return;
        const body = bodyRef.current;
        if (!body) return;
        let prevH = body.offsetHeight;
        const observer = new ResizeObserver(() => {
            const next = measureShape();
            if (!next) return;
            if (Math.abs(next.bodyHeight - prevH) < 1 && Math.abs(next.bodyWidth - shape.bodyWidth) < 1) return;
            prevH = next.bodyHeight;
            setShape(next);
        });
        observer.observe(body);
        return () => observer.disconnect();
    }, [open, shape]);

    useEffect(() => {
        if (!open) return;
        const remove = window.topbar.onCloseMenus(() => triggerClose());
        return () => remove();
    }, [open]);

    useEffect(() => () => {
        clearTimeout(closeTimer.current);
        clearTimeout(shrinkTimer.current);
        clearChromeSurface(idRef.current);
        if (activeMenu === selfRef.current) {
            activeMenu = null;
            window.topbar.setActiveRegion(null);
        }
    }, []);

    function triggerClose() {
        pendingClose.current = true;
        if (activeMenu === selfRef.current) activeMenu = null;
        clearChromeSurface(idRef.current);
        clearTimeout(shrinkTimer.current);
        regionBottomRef.current = 0;
        window.topbar.setActiveRegion(null);
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            setOpen(false);
            setShape(null);
        }, CLOSE_MS);
    }

    function handleEnter() {
        clearTimeout(closeTimer.current);
        const other = activeMenu && activeMenu !== selfRef.current ? activeMenu : null;
        if (other) other.close();
        activeMenu = selfRef.current;
        if (open) {
            if (pendingClose.current) {
                pendingClose.current = false;
                setShape(null);
            }
            return;
        }
        pendingClose.current = false;
        const triggerRect = wrapperRef.current?.getBoundingClientRect();
        window.topbar.setActiveRegion({
            top: triggerRect ? triggerRect.bottom : BAR_BOTTOM,
            bottom: window.innerHeight,
            left: 0,
            right: window.innerWidth,
        });
        setShape(null);
        setOpen(true);
    }

    return (
        <div
            ref={wrapperRef}
            className="relative flex items-center self-stretch"
            style={{ backgroundColor: open ? BG : "transparent", transition: "background-color 120ms ease" }}
            onMouseEnter={handleEnter}
        >
            <div className="cursor-pointer">{trigger}</div>
            {open && createPortal(
                <div
                    ref={clipRef}
                    onMouseEnter={handleEnter}
                    style={{
                        position: "fixed",
                        left: shape ? shape.left : -9999,
                        top: BAR_BOTTOM,
                        width: shape ? shape.bodyWidth : undefined,
                        zIndex: 5,
                        pointerEvents: superseded ? "none" : (shape ? "auto" : "none"),
                        visibility: superseded ? "hidden" : undefined,
                        willChange: "clip-path",
                    }}
                >
                    <div ref={bodyRef}>{children}</div>
                </div>,
                document.body
            )}
        </div>
    );
}
